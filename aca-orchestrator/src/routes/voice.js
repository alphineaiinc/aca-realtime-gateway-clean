// src/routes/voice.js
// Server-side routes for tenant voice profile & preview
// IMPORTANT: This file runs on Node.js (no window/document here)

const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
// When we wire real preview, we can import synthesizeSpeech:
// const { synthesizeSpeech } = require("../../tts");

const router = express.Router();

// ---------------------------------------------------------------------------
// Middleware: verify JWT and extract tenant_id
// ---------------------------------------------------------------------------
function authenticate(req, res, next) {
  try {
    const raw = req.headers.authorization || "";
    const token = raw.replace("Bearer ", "").trim();
    if (!token) {
      return res
        .status(401)
        .json({ ok: false, error: "Missing Authorization Bearer token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.tenant_id) {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid token or tenant_id missing" });
    }

    req.tenant_id = decoded.tenant_id;
    req.jwt_payload = decoded;
    return next();
  } catch (err) {
    console.error("🔐 [voice] JWT error:", err);
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

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
router.get("/profile", authenticate, async (req, res) => {
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
router.post("/profile", authenticate, async (req, res) => {
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
// POST /api/voice/preview – stub route for dashboard preview
// (mounted at /api/voice → final path /api/voice/preview)
// ---------------------------------------------------------------------------
router.post("/preview", authenticate, async (req, res) => {
  try {
    // For now, just return a JSON error so the dashboard shows a clear message.
    // This keeps the server from crashing and avoids using document/window.
    return res
      .status(501)
      .json({ ok: false, error: "Voice preview is not yet implemented on server" });
  } catch (err) {
    console.error("❌ [voice] Error in preview stub:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Unexpected error in preview stub" });
  }
});

module.exports = router;
