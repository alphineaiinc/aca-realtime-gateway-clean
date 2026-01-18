// src/routes/demo.js
const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { demoConfig } = require("../brain/utils/demoConfig");
const { strictOriginCheck, rateLimitDemo, getClientIp, hashIp } = require("../db/demoGuards");

const router = express.Router();

router.post("/token", strictOriginCheck, rateLimitDemo, (req, res) => {
  const cfg = demoConfig();
  if (!cfg.enabled) return res.status(404).json({ ok: false, error: "Demo disabled" });

  if (!process.env.JWT_SECRET) {
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
    jti, // standard JWT ID claim (helps tooling)

    // ✅ IP binding without storing IP in token
    ip_hash: hashIp(ip),

    // Optional metadata (kept minimal)
    iss,
    aud,
  };

  // Note: jwt.sign will add iat automatically unless disabled
  // expiresIn accepts seconds string/number; cfg.ttl is expected to be seconds
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: cfg.ttl });

  // IMPORTANT: do not log token, do not log IP beyond minimal operational logs
  return res.json({
    ok: true,
    token,
    expires_in: cfg.ttl,
    tenant_id: cfg.tenantId,
  });
});

module.exports = router;
