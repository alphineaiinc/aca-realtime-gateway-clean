// src/brain/utils/rateLimiters.js
// Story 12.8 — lightweight in-memory rate limiting (Render-safe)
// Secure default: best-effort abuse control; resets on deploy/restart (acceptable for demo MVP)

const buckets = new Map(); // key -> { count, resetAt }

function nowMs() {
  return Date.now();
}

function hit(key, windowMs, max) {
  const now = nowMs();
  const cur = buckets.get(key);

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
        (req.headers["x-forwarded-for"] ? String(req.headers["x-forwarded-for"]).split(",")[0].trim() : "") ||
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
      // Fail-open to avoid taking prod down due to limiter bug
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
    } catch (e) {}
    return next();
  };
}

module.exports = {
  rateLimitIP,
  rateLimitKey,
};
