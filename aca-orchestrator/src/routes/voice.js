// src/routes/voice.js
// ----------------------------------------------------
// Story 9.X — Voice Studio API
// Per-tenant voice profile + preview endpoint
// ----------------------------------------------------
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { synthesizeSpeech } = require("../../tts");
const { getTenantRegion } = require("../brain/utils/tenantContext"); // ✅ Tenant region helper

const router = express.Router();

// ----------------------------------------------------
// Simple JWT auth middleware (same pattern as uploadKnowledge)
// Expects Authorization: Bearer <token>
// Token should contain: { tenant_id, role, ... }
// ----------------------------------------------------
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) throw new Error("Missing token");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.tenant_id) throw new Error("Missing tenant_id in token");

    req.tenant_id = decoded.tenant_id;
    req.jwt_payload = decoded;
    next();
  } catch (err) {
    console.error("❌ [voice] Auth failed:", err.message);
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

// ----------------------------------------------------
// GET /api/voice/profile
// Returns the current tenant voice profile (if any)
// Optional query: ?langCode=en-US
// ----------------------------------------------------
router.get("/profile", authenticate, async (req, res) => {
  const tenantId = req.tenant_id;
  const { langCode = "en-US" } = req.query;

  try {
    const result = await pool.query(
      `
      SELECT tenant_id, lang_code, voice_id, tone_preset,
             stability, similarity_boost, speaking_rate, region_code
      FROM tenant_voice_profile
      WHERE tenant_id = $1 AND lang_code = $2
      LIMIT 1
      `,
      [tenantId, langCode]
    );

    if (result.rowCount === 0) {
      return res.json({
        ok: true,
        profile: {
          tenant_id: tenantId,
          lang_code: langCode,
          voice_id: null,
          tone_preset: "friendly",
          stability: 0.4,
          similarity_boost: 0.8,
          speaking_rate: 1.0,
          region_code: null,
        },
      });
    }

    return res.json({ ok: true, profile: result.rows[0] });
  } catch (err) {
    console.error("❌ [voice] GET /profile error:", err.message);
    return res.status(500).json({ ok: false, error: "DB error" });
  }
});

// ----------------------------------------------------
// POST /api/voice/profile
// Saves or updates the current tenant voice profile
// Body JSON:
// {
//   lang_code, voice_id, tone_preset,
//   stability, similarity_boost, speaking_rate, region_code
// }
// ----------------------------------------------------
router.post("/profile", authenticate, async (req, res) => {
  const tenantId = req.tenant_id;
  const {
    lang_code = "en-US",
    voice_id = null,
    tone_preset = "friendly",
    stability = 0.4,
    similarity_boost = 0.8,
    speaking_rate = 1.0,
    region_code = null,
  } = req.body || {};

  try {
    await pool.query(
      `
      INSERT INTO tenant_voice_profile
        (tenant_id, lang_code, voice_id, tone_preset,
         stability, similarity_boost, speaking_rate, region_code, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW())
      ON CONFLICT (tenant_id, lang_code)
      DO UPDATE SET
        voice_id = EXCLUDED.voice_id,
        tone_preset = EXCLUDED.tone_preset,
        stability = EXCLUDED.stability,
        similarity_boost = EXCLUDED.similarity_boost,
        speaking_rate = EXCLUDED.speaking_rate,
        region_code = EXCLUDED.region_code,
        updated_at = NOW()
      `,
      [
        tenantId,
        lang_code,
        voice_id,
        tone_preset,
        stability,
        similarity_boost,
        speaking_rate,
        region_code,
      ]
    );

    console.log(
      `✅ [voice] Saved voice profile for tenant=${tenantId}, lang=${lang_code}`
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("❌ [voice] POST /profile error:", err.message);
    return res.status(500).json({ ok: false, error: "DB error" });
  }
});

// ----------------------------------------------------
// POST /api/voice/preview
// Returns a short audio sample using current or provided settings.
// Body JSON:
// {
//   lang_code, sample_text?, tone_preset, region_code, use_fillers, voice_id?
// }
// ----------------------------------------------------
router.post("/preview", authenticate, async (req, res) => {
  const tenantId = req.tenant_id;
  const {
    lang_code = "en-US",
    sample_text,
    tone_preset = "friendly",
    region_code = null,
    use_fillers = true,
  } = req.body || {};

  const previewText =
    sample_text ||
    "Hi, this is your automated call assistant from Alphine AI. I am customizing your voice settings.";

  try {
    // If region_code not provided in body, fall back to tenant region
    let effectiveRegion = region_code;
    if (!effectiveRegion) {
      try {
        effectiveRegion = await getTenantRegion(tenantId);
      } catch (regionErr) {
        console.warn(
          `⚠️ [voice] Failed to resolve tenant region for tenant=${tenantId}:`,
          regionErr.message
        );
      }
    }

    const audioBuffer = await synthesizeSpeech(previewText, lang_code, {
      tenantId,
      regionCode: effectiveRegion,
      tonePreset: tone_preset,
      useFillers: !!use_fillers,
    });

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    return res.send(audioBuffer);
  } catch (err) {
    console.error("❌ [voice] POST /preview error:", err.message);
    return res.status(500).json({ ok: false, error: "Preview failed" });
  }
});

module.exports = router;
