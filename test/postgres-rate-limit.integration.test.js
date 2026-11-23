'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { createPostgresRateLimiter } = require('../src/middleware/postgresRateLimit');
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
  const unavailable = createPostgresRateLimiter({ pool: { query: async () => { throw new Error('private detail'); } }, scope });
  assert.equal(await invoke(unavailable, 'tenant-a'), 503);
});
