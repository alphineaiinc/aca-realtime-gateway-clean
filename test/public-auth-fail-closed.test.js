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
    express: { Router: () => ({ post: (route, handler) => { routes[route] = handler; }, get() {} }) },
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
  assert.equal(source.includes('jwt.sign('), false);
});

test('unverified public signup cannot create tenant, business, API key or JWT', async () => {
  for (const secret of [undefined, 'test-secret']) {
    const h = harness(secret);
    const r = await h.request('/public/signup', {
      email: 'victim@example.com', business_name: 'Unverified Business'
    });
    assert.equal(r.statusCode, 403);
    assert.equal(r.body.error, 'Verified onboarding required');
    assert.deepEqual(h.stats(), { queries: 0, signed: 0, connects: 0 });
    assert.equal(r.body.token, undefined);
    assert.equal(r.body.tenant_key, undefined);
  }
});

test('missing signup fields cannot bypass onboarding gate', async () => {
  const h = harness('test-secret');
  const r = await h.request('/public/signup', {});
  assert.equal(r.statusCode, 403);
  assert.deepEqual(h.stats(), { queries: 0, signed: 0, connects: 0 });
});

test('blocked public auth does not initialize an unverified TLS database pool', () => {
  assert.doesNotMatch(source, /rejectUnauthorized\\s*:\\s*false/);
  assert.doesNotMatch(source, /new\\s+Pool\\s*\\(/);
  assert.doesNotMatch(source, /require\\s*\\(\\s*['"]pg['"]\\s*\\)/);
});

test('missing request body is rejected without an exception', async () => {
  const h = harness('test-secret');
  const r = await h.request('/public/login', undefined);
  assert.equal(r.statusCode, 400);
  assert.deepEqual(h.stats(), { queries: 0, signed: 0, connects: 0 });
});
