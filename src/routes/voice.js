const console = require("../voice/voiceLogger").operationalConsole;
// src/routes/voice.js
// Server-side routes for tenant voice profile & preview
// IMPORTANT: This file runs on Node.js (no window/document here)

const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
// When we wire real preview, we can import synthesizeSpeech:
const { synthesizeSpeech } = require("../../tts");

const router = express.Router();
const ingressRateLimit=require("../security/ingressLimit").ingressLimit({max:30});


// Ensure JSON bodies are parsed for this router
router.use(express.json());

// ---------------------------------------------------------------------------
// Middleware: verify JWT and extract tenant_id
// ---------------------------------------------------------------------------
const {verifiedBusiness:authenticate}=require("../security/verifiedBusinessMiddleware");


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeProfilePayload(body = {}) {
  return {
    tts_provider:
      typeof body.tts_provider === "string" && body.tts_provider.trim()
        ? body.tts_provider.trim()
        : "elevenlabs",
    language_code:
      typeof body.language_code === "string" && body.language_code.trim()
        ? body.language_code.trim()
        : "en-US",
    voice_id:
      typeof body.voice_id === "string" && body.voice_id.trim()
        ? body.voice_id.trim()
        : null,
    stability:
      typeof body.stability === "number"
        ? body.stability
        : 0.5,
    similarity_boost:
      typeof body.similarity_boost === "number"
        ? body.similarity_boost
        : 0.75,
    style:
      typeof body.style === "number"
        ? body.style
        : 0.3,
    speaking_rate:
      typeof body.speaking_rate === "number"
        ? body.speaking_rate
        : 1.0,
    pitch_shift:
      typeof body.pitch_shift === "number"
        ? body.pitch_shift
        : 0,
    use_speaker_boost:
      typeof body.use_speaker_boost === "boolean"
        ? body.use_speaker_boost
        : true,
  };
}

// ---------------------------------------------------------------------------
// GET /api/voice/profile
// (mounted in index.js as app.use("/api/voice", router))
// ---------------------------------------------------------------------------
router.get("/profile", ingressRateLimit, authenticate, async (req, res) => {
  const tenantId = req.tenant_id;

  try {
    const { rows } = await pool.query(
      `
      SELECT
        tenant_id,
        tts_provider,
        language_code,
        voice_id,
        stability,
        similarity_boost,
        style,
        speaking_rate,
        pitch_shift,
        use_speaker_boost,
        created_at,
        updated_at
      FROM tenant_voice_profile
      WHERE tenant_id = $1
      LIMIT 1
      `,
      [tenantId]
    );

    if (!rows.length) {
      // No profile yet – return null but still ok:true
      return res.json({
        ok: true,
        profile: null,
      });
    }

    const profile = rows[0];

    return res.json({
      ok: true,
      profile,
    });
  } catch (err) {
    console.error("❌ [voice] Error fetching voice profile:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to fetch voice profile" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/voice/profile
// ---------------------------------------------------------------------------
router.post("/profile", ingressRateLimit, authenticate, async (req, res) => {
  const tenantId = req.tenant_id;
  const payload = normalizeProfilePayload(req.body || {});
  const now = new Date().toISOString();

  try {
    // Check if profile exists for this tenant
    const existing = await pool.query(
      `SELECT tenant_id FROM tenant_voice_profile WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );

    let result;
    if (!existing.rows.length) {
      // Insert new
      result = await pool.query(
        `
        INSERT INTO tenant_voice_profile (
          tenant_id,
          tts_provider,
          language_code,
          voice_id,
          stability,
          similarity_boost,
          style,
          speaking_rate,
          pitch_shift,
          use_speaker_boost,
          created_at,
          updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11
        )
        RETURNING
          tenant_id,
          tts_provider,
          language_code,
          voice_id,
          stability,
          similarity_boost,
          style,
          speaking_rate,
          pitch_shift,
          use_speaker_boost,
          created_at,
          updated_at
        `,
        [
          tenantId,
          payload.tts_provider,
          payload.language_code,
          payload.voice_id,
          payload.stability,
          payload.similarity_boost,
          payload.style,
          payload.speaking_rate,
          payload.pitch_shift,
          payload.use_speaker_boost,
          now,
        ]
      );
    } else {
      // Update existing
      result = await pool.query(
        `
        UPDATE tenant_voice_profile
        SET
          tts_provider       = $2,
          language_code      = $3,
          voice_id           = $4,
          stability          = $5,
          similarity_boost   = $6,
          style              = $7,
          speaking_rate      = $8,
          pitch_shift        = $9,
          use_speaker_boost  = $10,
          updated_at         = $11
        WHERE tenant_id = $1
        RETURNING
          tenant_id,
          tts_provider,
          language_code,
          voice_id,
          stability,
          similarity_boost,
          style,
          speaking_rate,
          pitch_shift,
          use_speaker_boost,
          created_at,
          updated_at
        `,
        [
          tenantId,
          payload.tts_provider,
          payload.language_code,
          payload.voice_id,
          payload.stability,
          payload.similarity_boost,
          payload.style,
          payload.speaking_rate,
          payload.pitch_shift,
          payload.use_speaker_boost,
          now,
        ]
      );
    }

    const savedProfile = result.rows[0];
    return res.json({
      ok: true,
      profile: savedProfile,
    });
  } catch (err) {
    console.error("❌ [voice] Error saving voice profile:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to save voice profile" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/voice/preview – generate an audio preview via ElevenLabs
// (mounted at /api/voice → final path /api/voice/preview)
// ---------------------------------------------------------------------------
router.post("/preview", ingressRateLimit, authenticate, async (req, res) => {
  if(process.env.ACA_VOICE_PREVIEW_ENABLED!=="true")return res.status(503).json({ok:false,error:"Preview unavailable"});
  const tenantId = req.tenant_id;
  const { text, profile } = req.body || {};

  try {
    const trimmedText =
      typeof text === "string" ? text.trim() : "";

    if (!trimmedText || trimmedText.length>500) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing or empty 'text' in request body" });
    }

    // Use language_code from profile if provided, else default to en-US
    const langCode =
      (profile &&
        typeof profile.language_code === "string" &&
        profile.language_code.trim()) ||
      "en-US";

    const explicitVoiceId =
      profile &&
      typeof profile.voice_id === "string" &&
      profile.voice_id.trim()
        ? profile.voice_id.trim()
        : null;

    console.log("🎧 [voice] Preview request:", {
      tenantId,
      langCode,
      hasProfilePayload: !!profile,
      explicitVoiceId,
    });

    // For preview, request MP3 so the browser <audio> element can play it.
    const audioBuffer = await synthesizeSpeech(trimmedText, langCode, {
      tenantId,
      outputFormat: "mp3_44100_128",
      acceptMime: "audio/mpeg",
      explicitVoiceId,
    });

    if (!audioBuffer || !audioBuffer.length) {
      console.error("❌ [voice] synthesizeSpeech returned empty buffer");
      return res
        .status(502)
        .json({ ok: false, error: "TTS engine returned no audio" });
    }

    // Send raw audio back to browser for <audio> element
    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length,
      "Cache-Control": "no-store",
    });

    return res.send(audioBuffer);
  } catch (err) {
    console.error("❌ [voice] Error generating preview:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to generate voice preview" });
  }
});

module.exports = router;
