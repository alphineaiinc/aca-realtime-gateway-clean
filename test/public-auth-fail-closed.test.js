'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/public.js'), 'utf8');
function harness(secret) {
  const routes = {};
  let queries = 0, signed = 0, connects = 0;
  const pool = { connect: async () => { connects++; throw new Error('Not needed'); }, query: async () => { queries++; return { rows: [{ id: 'victim' }] }; } };
  const mocks = {
    'express-rate-limit': {rateLimit:()=> (req,res,next)=>next()},
    '../middleware/postgresRateLimit': {createPostgresRateLimiter:()=> (req,res,next)=>next()},
    express: { Router: () => ({ post: (route, ...handlers) => { routes[route] = handlers.at(-1); }, get() {} }) },
    pg: { Pool: class { constructor() { return pool; } } },
    jsonwebtoken: { sign: () => { signed++; return 'forged-token'; } },
    'node:crypto': { randomBytes: () => Buffer.alloc(32, 1) },
    dotenv: { config() {} },
    path,
  };
  const context = { require: (name) => { if (!(name in mocks)) throw Error('Unexpected import: ' + name); return mocks[name]; },
    module: { exports: {} }, __dirname: path.join(__dirname, '../src/routes'), Buffer,
    process: { env: { DATABASE_URL: 'postgres://example', TENANT_JWT_SECRET: secret } }, console: { error() {}, log() {} }, Date };
  vm.runInNewContext(source, context);
  async function request(route, body) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
    await routes[route]({ body }, res);
    return res;
  }
  return { request, stats: () => ({ queries, signed, connects }) };
}
test('email-only login cannot mint a tenant JWT', async () => {
  const h = harness('test-secret');
  const r = await h.request('/public/login', { email: 'victim@example.com' });
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.error, 'Verified login required');
  assert.deepEqual(h.stats(), { queries: 0, signed: 0, connects: 0 });
});
test('missing email does not invoke login token issuance', async () => {
  const h = harness('test-secret');
  const r = await h.request('/public/login', {});
  assert.equal(r.statusCode, 400);
  assert.equal(h.stats().signed, 0);
});
test('no hardcoded tenant JWT signing fallback remains', () => {
  assert.doesNotMatch(source, /alphine_tenant_jwt_2025_secure/);
  assert.match(source, /if \(!jwtSecret\)/);
});

test('signup without JWT signing secret rejects before acquiring a DB client', async () => {
  const h = harness(undefined);
  const r = await h.request('/public/signup', { email: 'new@example.com', business_name: 'Test Business' });
  assert.equal(r.statusCode, 503);
  assert.deepEqual(h.stats(), { queries: 0, signed: 0, connects: 0 });
});
