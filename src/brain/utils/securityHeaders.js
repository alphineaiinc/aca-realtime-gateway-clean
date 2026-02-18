// src/brain/utils/securityHeaders.js
// Story 12.8 — security headers (no new deps)
// Keep CSP conservative to avoid breaking existing dashboard assets.

function securityHeaders(opts = {}) {
  const isProd = !!opts.isProd;

  // Allowlist basics; keep minimal to avoid breaking current UI.
  // If you later want strict CSP, we can tighten after confirming all asset origins.
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    "script-src 'self' 'unsafe-inline' https:",
    "connect-src 'self' https: wss:",
    "font-src 'self' data: https:",
  ].join("; ");

  return function (req, res, next) {
    try {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
      // Only send CSP in prod by default (less dev pain)
      if (isProd) res.setHeader("Content-Security-Policy", csp);
      res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    } catch (e) {}
    return next();
  };
}

module.exports = { securityHeaders };
