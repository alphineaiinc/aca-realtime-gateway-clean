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
    const identity = req.auth?.sub != null ? ['user', req.auth.sub]
      : req.auth?.partner_id != null ? ['partner', req.auth.partner_id]
      : req.partner_id != null ? ['partner', req.partner_id]
      : req.tenant_id != null ? ['tenant', req.tenant_id] : null;
    if (!identity || String(identity[1]).length === 0) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    const key = identity[0] + ':' + String(identity[1]);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
    }
    bucket.count += 1;
    // Prune expired entries, but never evict live buckets: doing so lets attackers
    // bypass limits by cycling identities. Fail closed if the key cap is reached.
    if (!buckets.has(key) && buckets.size >= maxKeys) {
      for (const [id, existing] of buckets) {
        if (now >= existing.resetAt) buckets.delete(id);
      }
      if (buckets.size >= maxKeys) {
        res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ ok: false, error: 'Rate limit capacity reached' });
      }
    }
    buckets.set(key, bucket);
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ ok: false, error: 'Rate limit exceeded' });
    }
    return next();
  };
}
module.exports = { createAuthenticatedRateLimiter };
