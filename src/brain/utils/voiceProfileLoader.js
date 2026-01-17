// src/brain/utils/voiceProfileLoader.js
// ----------------------------------------------------
// Story 9.X — Tenant Voice Profile Loader
// Central helper for fetching per-tenant voice settings.
// ----------------------------------------------------
const pool = require("../../db/pool");

// Simple in-memory cache to avoid hitting DB on every TTS call.
// Key: `${tenantId}:${langCode}`
const cache = new Map();
const CACHE_TTL_MS = 60_000; // 1 minute

function cacheKey(tenantId, langCode) {
  return `${tenantId || "anon"}:${langCode || "en-US"}`;
}

/**
 * getTenantVoiceProfile
 *
 * @param {number|null} tenantId
 * @param {string} langCode
 * @returns {Promise<object|null>}
 */
async function getTenantVoiceProfile(tenantId, langCode = "en-US") {
  if (!tenantId) return null;

  const key = cacheKey(tenantId, langCode);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

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
    const defaultProfile = {
      tenant_id: tenantId,
      lang_code: langCode,
      voice_id: null,
      tone_preset: "friendly",
      stability: 0.4,
      similarity_boost: 0.8,
      speaking_rate: 1.0,
      region_code: null,
    };
    cache.set(key, { ts: now, data: defaultProfile });
    return defaultProfile;
  }

  const row = result.rows[0];
  cache.set(key, { ts: now, data: row });
  return row;
}

module.exports = { getTenantVoiceProfile };
