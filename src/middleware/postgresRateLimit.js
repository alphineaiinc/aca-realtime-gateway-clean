'use strict';
const { createHash } = require('node:crypto');
function createPostgresRateLimiter({ pool, scope, windowMs = 60000, max = 60 }) {
  if (!pool || typeof pool.query !== 'function' || typeof scope !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(scope) || !Number.isSafeInteger(windowMs) || windowMs < 1 || windowMs > 86400000 || !Number.isSafeInteger(max) || max < 1 || max > 1000000) throw new TypeError('Invalid rate limiter configuration');
  return async function postgresRateLimit(req, res, next) {
    const identity = req.auth?.sub != null ? ['user', req.auth.sub]
      : req.auth?.partner_id != null ? ['partner', req.auth.partner_id]
      : req.partner_id != null ? ['partner', req.partner_id]
      : req.tenant_id != null ? ['tenant', req.tenant_id] : null;
    if (!identity || !String(identity[1]).length) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const hash = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    let row;
    try {
      const result = await pool.query(
        `INSERT INTO aca_rate_limit_buckets (scope, principal_hash, reset_at, hits)
         VALUES ($1, $2, clock_timestamp() + $3::integer * interval '1 millisecond', 1)
         ON CONFLICT (scope, principal_hash) DO UPDATE SET
           hits = CASE WHEN aca_rate_limit_buckets.reset_at <= clock_timestamp() THEN 1
                       ELSE LEAST(aca_rate_limit_buckets.hits + 1, $4::integer + 1) END,
           reset_at = CASE WHEN aca_rate_limit_buckets.reset_at <= clock_timestamp()
                           THEN clock_timestamp() + $3::integer * interval '1 millisecond'
                           ELSE aca_rate_limit_buckets.reset_at END
         RETURNING hits, GREATEST(1, CEIL(EXTRACT(EPOCH FROM reset_at - clock_timestamp()))) AS retry_after`,
        [scope, hash, windowMs, max]);
      row = result.rows[0];
      if (!row || !Number.isSafeInteger(Number(row.hits)) || Number(row.hits) < 1) throw new Error('Invalid limiter result');
    } catch {
      return res.status(503).json({ ok: false, error: 'Rate limit service unavailable' });
    }
    if (Number(row.hits) > max) {
      res.setHeader('Retry-After', String(Math.max(1, Number(row.retry_after) || 1)));
      return res.status(429).json({ ok: false, error: 'Rate limit exceeded' });
    }
    return next();
  };
}
module.exports = { createPostgresRateLimiter };
