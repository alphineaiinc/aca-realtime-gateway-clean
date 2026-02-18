// src/routes/demo.js
// Story 12.8 — Public demo token mint endpoint (short-lived JWT)
// Secure defaults:
// - refuses if DEMO_JWT_SECRET missing
// - strict Origin allowlist in production (fail closed)
// - rate limited per IP

const express = require("express");
const jwt = require("jsonwebtoken");

const { rateLimitIP } = require("../brain/utils/rateLimiters");

const router = express.Router();
router.use(express.json({ limit: "16kb" }));

// -------------------------
// Helpers
// -------------------------
function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function parseAllowedOrigins() {
  // Comma-separated list. Example:
  // ALLOWED_ORIGINS=https://aca-realtime-gateway-clean.onrender.com,https://alphineai.com,https://www.alphineai.com
  const raw = String(process.env.ALLOWED_ORIGINS || "").trim();
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Safe default: include Render base if provided
  const renderBase = String(process.env.RENDER_BASE_URL || "").trim();
  if (renderBase && !list.includes(renderBase)) list.push(renderBase);

  return list;
}

function originAllowed(req) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return false;

  const allowed = parseAllowedOrigins();
  if (!allowed.length) return false;

  return allowed.includes(origin);
}

// -------------------------
// Rate limit: demo token mint
// -------------------------
// default: 10 per hour, but allow a small burst (2/min) by stacking another limiter
router.use(rateLimitIP({ windowMs: 60 * 60 * 1000, max: parseInt(process.env.DEMO_TOKEN_MAX_PER_HOUR || "10", 10), keyPrefix: "demo_token_h" }));
router.use(rateLimitIP({ windowMs: 60 * 1000, max: parseInt(process.env.DEMO_TOKEN_MAX_PER_MIN || "2", 10), keyPrefix: "demo_token_m" }));

// -------------------------
// POST /api/demo/token
// -------------------------
router.post("/token", async (req, res) => {
  try {
    // Fail closed on origin in production
    if (isProd()) {
      if (!originAllowed(req)) {
        return res.status(403).json({ ok: false, error: "origin_not_allowed" });
      }
    }

    const secret = String(process.env.DEMO_JWT_SECRET || "").trim();
    if (!secret) {
      // Secure default: no demo tokens without explicit secret
      return res.status(503).json({ ok: false, error: "demo_disabled" });
    }

    const tenantId = parseInt(process.env.DEMO_TENANT_ID || "1", 10) || 1;
    const ttlSec = parseInt(process.env.DEMO_TOKEN_TTL_SEC || "900", 10); // default 15 min

    const issuer = String(process.env.JWT_ISSUER || "alphine-ai").trim();
    const audience = String(process.env.JWT_AUDIENCE || "aca-demo").trim();

    const payload = {
      role: "demo",
      tenant_id: tenantId,
      // keep it minimal; no PII
    };

    const token = jwt.sign(payload, secret, {
      expiresIn: ttlSec,
      issuer,
      audience,
    });

    res.set("Cache-Control", "no-store");
    return res.json({
      ok: true,
      token,
      expires_in: ttlSec,
      tenant_id: tenantId,
      locale_default: String(process.env.DEMO_LOCALE_DEFAULT || "en-US"),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "demo_token_error" });
  }
});

module.exports = router;
