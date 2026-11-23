'use strict';
// Per-process rate limiting for authenticated administrative/partner endpoints.
// A shared Redis-backed limiter is required before multi-instance production rollout.
function createAuthenticatedRateLimiter({ windowMs = 60_000, max = 60, maxKeys = 10_000 } = {}) {
  if (![windowMs, max, maxKeys].every(v => Number.isSafeInteger(v) && v > 0)) {
    throw new TypeError('Rate limiter options must be positive integers');
  }
  const buckets = new Map();
  return function authenticatedRateLimit(req, res, next) {
    // Must run AFTER successful authentication. Never use an anonymous shared bucket.
    const principal = req.auth?.sub || req.auth?.partner_id || req.partner_id || req.tenant_id;
    if (principal === undefined || principal === null || String(principal).length === 0) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    const key = String(principal);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
    }
    bucket.count += 1;
    // Refresh insertion order for bounded eviction.
    buckets.delete(key);
    buckets.set(key, bucket);
    if (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value);
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ ok: false, error: 'Rate limit exceeded' });
    }
    return next();
  };
}
module.exports = { createAuthenticatedRateLimiter };
