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
