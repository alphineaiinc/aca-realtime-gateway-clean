// src/routes/demo.js
// Story 12.8 — Public demo token mint endpoint (short-lived JWT)
// Secure defaults:
// - strict Origin allowlist via demoGuards
// - rate limited via demoGuards
// - demo tokens are short-lived and tenant-locked

const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { demoConfig } = require("../brain/utils/demoConfig");
const {
  strictOriginCheck,
  rateLimitDemo,
  getClientIp,
  hashIp,
} = require("../brain/utils/demoGuards");

const router = express.Router();
router.use(express.json({ limit: "16kb" }));

router.post("/token", strictOriginCheck, rateLimitDemo, (req, res) => {
  const cfg = demoConfig();
  if (!cfg.enabled) {
    return res.status(404).json({ ok: false, error: "Demo disabled" });
  }

  const signingSecret = process.env.DEMO_JWT_SECRET || process.env.JWT_SECRET;
  if (!signingSecret) {
    return res.status(500).json({ ok: false, error: "Server not configured" });
  }

  // ✅ Security: never cache demo tokens
  res.setHeader("Cache-Control", "no-store");

  // ✅ Security: bind token to request IP (hashed)
  const ip = getClientIp(req);

  // ✅ Security: unique token id for per-token rate limiting + revocation hooks later
  const jti = crypto.randomBytes(16).toString("hex");

  // Optional standard claims (safe defaults; no breaking dependency)
  const iss = process.env.DEMO_TOKEN_ISSUER || "alphineai_demo";
  const aud = process.env.DEMO_TOKEN_AUDIENCE || "aca_webchat_demo";

  const payload = {
    // Demo identity
    role: "demo",
    demo: true,

    // ✅ Tenant lock (server will also enforce this on every entrypoint)
    tenant_id: cfg.tenantId,

    // ✅ Per-token limiter key (custom + standard)
    demo_jti: jti,
    jti,

    // ✅ IP binding without storing IP in token
    ip_hash: hashIp(ip),

    // Optional metadata
    iss,
    aud,
  };

  const token = jwt.sign(payload, signingSecret, { expiresIn: cfg.ttl });

  return res.json({
    ok: true,
    token,
    expires_in: cfg.ttl,
    tenant_id: cfg.tenantId,
  });
});

module.exports = router;