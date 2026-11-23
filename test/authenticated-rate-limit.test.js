const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthenticatedRateLimiter } = require('../src/middleware/authenticatedRateLimit');
function invoke(middleware, principal) {
  const req = { auth: principal === null ? undefined : { sub: principal } };
  const result = { status: null, next: false, retryAfter: null };
  const res = {
    setHeader(name, value) { if (name === 'Retry-After') result.retryAfter = value; },
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; },
  };
  middleware(req, res, () => { result.next = true; });
  return result;
}
test('authenticated rate limiter rejects missing identity', () => {
  assert.equal(invoke(createAuthenticatedRateLimiter(), null).status, 401);
});
test('isolates tenants and returns 429 with Retry-After', () => {
  const limit = createAuthenticatedRateLimiter({ windowMs: 1000, max: 2 });
  assert.equal(invoke(limit, 'a').next, true);
  assert.equal(invoke(limit, 'a').next, true);
  assert.equal(invoke(limit, 'a').status, 429);
  assert.ok(Number(invoke(limit, 'a').retryAfter) >= 1);
  assert.equal(invoke(limit, 'b').next, true);
});
test('invalid limits are rejected', () => {
  assert.throws(() => createAuthenticatedRateLimiter({ max: 0 }), TypeError);
});

const fs = require('node:fs');
const path = require('node:path');
test('all billing and leaderboard routes enforce rate limits after authentication', () => {
  for (const [file, limiter] of [['billing.js','billingRateLimit'],['partnerLeaderboard.js','partnerRateLimit']]) {
    const source = fs.readFileSync(path.join(__dirname,'../src/routes',file),'utf8');
    const routes = source.split('\n').filter(line => /router\.(get|post|put|patch|delete)\(/.test(line));
    assert.ok(routes.length >= 4, file);
    for (const route of routes) assert.ok(route.includes('authenticate, '+limiter), route);
  }
});

test('bounded limiter does not evict active buckets and reset their counters', () => {
  const limit = createAuthenticatedRateLimiter({ windowMs: 60000, max: 1, maxKeys: 2 });
  assert.equal(invoke(limit, 'a').next, true);
  assert.equal(invoke(limit, 'b').next, true);
  assert.equal(invoke(limit, 'c').status, 429);
  assert.equal(invoke(limit, 'a').status, 429);
});
test('user and tenant identifiers cannot collide', () => {
  const limit = createAuthenticatedRateLimiter({ windowMs: 60000, max: 1 });
  assert.equal(invoke(limit, 'same').next, true);
  const req = { tenant_id: 'same' };
  const res = { status(n) { this.code = n; return this; }, json() { return this; }, setHeader() {} };
  let advanced = false;
  limit(req, res, () => { advanced = true; });
  assert.equal(advanced, true);
});

test('payment write route retains a separate stricter three-per-ten-seconds limiter', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/billing.js'), 'utf8');
  assert.ok(source.includes('const paymentRateLimit = createPostgresRateLimiter({ pool, scope: "billing-payment", windowMs: 10_000, max: 3 })'));
  assert.match(source, /router\.post\("\/pay", authenticate, billingRateLimit, paymentRateLimit,/);
  assert.doesNotMatch(source, /const rateBucket = new Map\(/);
});

test('all partner dashboard routes enforce shared limits after partner authentication', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/partnerDashboard.js'), 'utf8');
  const routes = source.split('\n').filter(line => line.startsWith('router.get('));
  assert.equal(routes.length, 3);
  for (const route of routes) assert.ok(route.includes('partnerAuth, dashboardRateLimit,'));
  assert.ok(source.includes('createPostgresRateLimiter({ pool, scope: "partner-dashboard"'));
});

test('partner registration has explicit public quota and cryptographic referral generation', () => {
 const source = fs.readFileSync(path.join(__dirname,'../src/routes/partner.js'),'utf8');
 assert.ok(source.includes('router.post("/register", registrationLimit, async'));
 assert.ok(source.includes('publicGlobal: true'));
 assert.ok(source.includes('crypto.randomBytes(3)'));
 assert.ok(!source.includes('Math.random('));
});


test('partner dashboard applies a shared IP ingress budget before DB-backed partner authentication', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/partnerDashboard.js'), 'utf8');
  const routes = source.split('\\n').filter(line => line.startsWith('router.get('));
  assert.equal(routes.length, 3);
  for (const route of routes) assert.ok(route.includes('dashboardIngressLimit, partnerAuth, dashboardRateLimit,'), route);
  assert.ok(source.includes('scope: "partner-dashboard-ingress"'));
  assert.ok(source.includes('ipBased: true'));
});
