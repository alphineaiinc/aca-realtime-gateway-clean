// src/brain/utils/demoGuards.js
const crypto = require("crypto");
const { demoConfig } = require("./demoConfig");

const ipBucket = new Map();     // ip -> {count, resetAt}
const tokenBucket = new Map();  // jti -> {count, resetAt}

function nowMs() { return Date.now(); }

// ------------------------------------------------------------------
// Story 12.8.1 — Public Demo Mode Guards (security-first)
// Updates:
// - Normalize IP parsing + strip IPv6 ::ffff: prefix
// - Respect Render/Cloudflare forwarding chain safely (first IP only)
// - Add minimal helper: attachDemoJtiFromAuth(req) (non-breaking)
// - Add safe bucket sweeper (unref) to avoid unbounded Map growth
// - Keep existing exported API (no breaking changes)
// ------------------------------------------------------------------

function normalizeIp(ip) {
  const s = String(ip || "").trim();
  // Common node format: "::ffff:203.0.113.10"
  if (s.startsWith("::ffff:")) return s.slice(7);
  return s || "unknown";
}

function getClientIp(req) {
  // Render forwards IP in x-forwarded-for (first is client)
  const xff = (req.headers["x-forwarded-for"] || "").toString();
  if (xff) {
    const first = xff.split(",")[0].trim();
    return normalizeIp(first);
  }
  return normalizeIp((req.socket && req.socket.remoteAddress) || "unknown");
}

function strictOriginCheck(req, res, next) {
  const cfg = demoConfig();
  if (!cfg.enabled) return res.status(404).json({ ok: false, error: "Demo disabled" });

  const origin = (req.headers.origin || "").toString();
  if (!origin) return res.status(403).json({ ok: false, error: "Missing Origin" });

  if (cfg.allowedOrigins.length > 0 && !cfg.allowedOrigins.includes(origin)) {
    return res.status(403).json({ ok: false, error: "Origin not allowed" });
  }

  // Set tight CORS response (do NOT use wildcard)
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "false");

  // Security: ensure demo token response isn't cached by browsers/proxies
  // (harmless for other demo endpoints)
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  next();
}

// Optional helper (non-breaking): some routes may set req.demo_jti later.
// If an upstream auth middleware already attached it, we keep it.
// If it’s absent but a custom header is present (future use), attach it.
// (We intentionally do NOT parse Authorization here to avoid duplicating auth logic.)
function attachDemoJtiFromAuth(req) {
  if (req.demo_jti) return req.demo_jti;

  const hdr = (req.headers["x-demo-jti"] || "").toString().trim();
  if (hdr) {
    req.demo_jti = hdr;
    return hdr;
  }
  return null;
}

function rateLimitDemo(req, res, next) {
  const cfg = demoConfig();
  const ip = getClientIp(req);

  const winMs = 60_000;

  // Per-IP
  const ipState = ipBucket.get(ip) || { count: 0, resetAt: nowMs() + winMs };
  if (nowMs() > ipState.resetAt) {
    ipState.count = 0;
    ipState.resetAt = nowMs() + winMs;
  }
  ipState.count += 1;
  ipBucket.set(ip, ipState);

  if (ipState.count > cfg.perMinIp) {
    return res.status(429).json({ ok: false, error: "Rate limit (ip)" });
  }

  // Per-token jti (if present)
  const jti = req.demo_jti || attachDemoJtiFromAuth(req);
  if (jti) {
    const tState = tokenBucket.get(jti) || { count: 0, resetAt: nowMs() + winMs };
    if (nowMs() > tState.resetAt) {
      tState.count = 0;
      tState.resetAt = nowMs() + winMs;
    }
    tState.count += 1;
    tokenBucket.set(jti, tState);

    if (tState.count > cfg.perMinToken) {
      return res.status(429).json({ ok: false, error: "Rate limit (token)" });
    }
  }

  next();
}

function hashIp(ip) {
  // NOTE: we hash normalized IP to keep binding stable across ::ffff: formats
  return crypto.createHash("sha256").update(normalizeIp(ip)).digest("hex");
}

// Prevent unbounded growth: occasionally sweep stale buckets (best-effort)
function sweepBuckets() {
  const cutoff = nowMs() - 5 * 60_000; // keep ~5 minutes of idle buckets
  let ipDel = 0;
  let tokDel = 0;

  for (const [k, v] of ipBucket.entries()) {
    if (!v || !v.resetAt || v.resetAt < cutoff) {
      ipBucket.delete(k);
      ipDel += 1;
    }
  }

  for (const [k, v] of tokenBucket.entries()) {
    if (!v || !v.resetAt || v.resetAt < cutoff) {
      tokenBucket.delete(k);
      tokDel += 1;
    }
  }

  // No logs here (log minimization). This is an internal hygiene sweep.
}

// Run sweeper (do not keep process alive solely for this)
setInterval(sweepBuckets, 60_000).unref?.();

module.exports = { strictOriginCheck, rateLimitDemo, getClientIp, hashIp };
