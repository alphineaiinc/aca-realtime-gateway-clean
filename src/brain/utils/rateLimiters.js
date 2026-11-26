// src/brain/utils/rateLimiters.js
// Story 12.8 — lightweight in-memory rate limiting (Render-safe)
// Secure default: best-effort abuse control; resets on deploy/restart (acceptable for demo MVP)

const buckets = new Map();
const CAPACITY = 10000; // key -> { count, resetAt }

function nowMs() {
  return Date.now();
}

function hit(key, windowMs, max) {
  const now = nowMs();
  for (const [k,v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  const cur = buckets.get(key);
  if (!cur && buckets.size >= CAPACITY) return { ok: false, remaining: 0, resetAt: now + windowMs };

  if (!cur || now > cur.resetAt) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { ok: true, remaining: max - 1, resetAt: next.resetAt };
  }

  cur.count += 1;
  buckets.set(key, cur);

  if (cur.count > max) {
    return { ok: false, remaining: 0, resetAt: cur.resetAt };
  }

  return { ok: true, remaining: Math.max(0, max - cur.count), resetAt: cur.resetAt };
}

// IP-based limiter
function rateLimitIP(opts) {
  const windowMs = parseInt(String(opts?.windowMs ?? 60_000), 10);
  const max = parseInt(String(opts?.max ?? 60), 10);
  const keyPrefix = String(opts?.keyPrefix ?? "ip");

  return function (req, res, next) {
    try {
      const ip =
        req.ip ||
        req.connection?.remoteAddress ||
        "unknown";

      const key = `${keyPrefix}:${ip}`;
      const r = hit(key, windowMs, max);

      // Helpful headers (safe)
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(r.remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.floor(r.resetAt / 1000)));

      if (!r.ok) {
        return res.status(429).json({ ok: false, error: "rate_limited" });
      }
    } catch (e) {
      return res.status(503).json({ ok: false, error: "rate_limit_unavailable" });
    }
    return next();
  };
}

// Identity-based limiter (e.g., tenant+session)
function rateLimitKey(keyFn, opts) {
  const windowMs = parseInt(String(opts?.windowMs ?? 60_000), 10);
  const max = parseInt(String(opts?.max ?? 60), 10);
  const keyPrefix = String(opts?.keyPrefix ?? "key");

  return function (req, res, next) {
    try {
      const k = typeof keyFn === "function" ? String(keyFn(req) || "") : "";
      const key = `${keyPrefix}:${k || "unknown"}`;
      const r = hit(key, windowMs, max);

      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(r.remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.floor(r.resetAt / 1000)));

      if (!r.ok) {
        return res.status(429).json({ ok: false, error: "rate_limited" });
      }
    } catch (e) { return res.status(503).json({ ok: false, error: "rate_limit_unavailable" }); }
    return next();
  };
}

module.exports = {
  rateLimitIP,
  rateLimitKey,
};
