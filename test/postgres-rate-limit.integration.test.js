'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { createPostgresRateLimiter, pruneExpiredRateLimitBuckets } = require('../src/middleware/postgresRateLimit');
const enabled = process.env.RUN_RATE_LIMIT_CI === '1';
test('shared PostgreSQL limiter enforces atomic budgets across independent pools', { skip: !enabled }, async t => {
  const url = process.env.RATE_LIMIT_CI_DATABASE_URL;
  assert.ok(url);
  const parsed = new URL(url);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.pathname, '/aca_rate_limit_ci');
  const pools = [new Pool({ connectionString: url }), new Pool({ connectionString: url })];
  t.after(async () => { await Promise.all(pools.map(p => p.end())); });
  const scope = 'ci-' + require('node:crypto').randomUUID();
  const limiters = pools.map(pool => createPostgresRateLimiter({ pool, scope, max: 5, windowMs: 60000 }));
  async function invoke(limiter, tenant) {
    const res = { code: 200, status(n) { this.code = n; return this; }, json() { return this; }, setHeader() {} };
    await limiter({ tenant_id: tenant }, res, () => {});
    return res.code;
  }
  const results = await Promise.all(Array.from({length: 20}, (_, i) => invoke(limiters[i % 2], 'tenant-a')));
  assert.equal(results.filter(x => x === 200).length, 5);
  assert.equal(results.filter(x => x === 429).length, 15);
  assert.equal(await invoke(limiters[1], 'tenant-b'), 200);
  assert.equal(await invoke(limiters[0], null), 401);
  await pools[0].query("UPDATE aca_rate_limit_buckets SET reset_at = clock_timestamp() - interval '1 second' WHERE scope = $1", [scope]);
  assert.equal(await invoke(limiters[1], 'tenant-a'), 200);
  assert.equal(await pruneExpiredRateLimitBuckets(pools[0], 1), 1);
  const remaining = await pools[1].query('SELECT hits FROM aca_rate_limit_buckets WHERE scope = $1', [scope]);
  assert.equal(remaining.rowCount, 1);
  assert.equal(Number(remaining.rows[0].hits), 1);
  assert.equal(await pruneExpiredRateLimitBuckets(pools[1], 1), 0);
  const publicScope = scope + '-public';
  const publicLimiters = pools.map(pool => createPostgresRateLimiter({pool,scope:publicScope,max:3,windowMs:60000,publicGlobal:true}));
  const publicResults = await Promise.all(Array.from({length:12},(_,i)=>invoke(publicLimiters[i%2],i%3===0?null:'caller-'+i)));
  assert.equal(publicResults.filter(code=>code===200).length,3);
  assert.equal(publicResults.filter(code=>code===429).length,9);
  const unavailable = createPostgresRateLimiter({ pool: { query: async () => { throw new Error('private detail'); } }, scope });
  assert.equal(await invoke(unavailable, 'tenant-a'), 503);
});


test('shared PostgreSQL IP ingress limiter budgets callers independently before authentication', { skip: !enabled }, async () => {
  const url = process.env.RATE_LIMIT_CI_DATABASE_URL;
  const pool = new Pool({ connectionString: url });
  try {
    const scope = 'ci-ip-' + require('node:crypto').randomUUID();
    const limiter = createPostgresRateLimiter({ pool, scope, max: 2, windowMs: 60000, ipBased: true });
    async function invokeIp(ip) {
      const res = { code: 200, status(n) { this.code = n; return this; }, json() { return this; }, setHeader() {} };
      await limiter({ ip }, res, () => {});
      return res.code;
    }
    assert.equal(await invokeIp('198.51.100.10'), 200);
    assert.equal(await invokeIp('198.51.100.10'), 200);
    assert.equal(await invokeIp('198.51.100.10'), 429);
    assert.equal(await invokeIp('198.51.100.11'), 200);
    assert.equal(await invokeIp(undefined), 401);
  } finally {
    await pool.end();
  }
});
