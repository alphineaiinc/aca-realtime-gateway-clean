// src/brain/utils/demoConfig.js
function demoConfig() {
  const enabled = String(process.env.DEMO_MODE_ENABLED || "").toLowerCase() === "true";

  const tenantId = Number(process.env.DEMO_TENANT_ID || 0);
  const ttl = Number(process.env.DEMO_TOKEN_TTL_SECONDS || 900);

  const perMinIp = Number(process.env.DEMO_RATE_PER_MIN_IP || 20);
  const perMinToken = Number(process.env.DEMO_RATE_PER_MIN_TOKEN || 60);

  const allowedOrigins = String(process.env.DEMO_ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  return { enabled, tenantId, ttl, perMinIp, perMinToken, allowedOrigins };
}

module.exports = { demoConfig };
