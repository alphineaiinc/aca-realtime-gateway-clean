const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const publicRoute = fs.readFileSync(path.join(root, 'src/routes/public.js'), 'utf8');
const pool = fs.readFileSync(path.join(root, 'src/db/pool.js'), 'utf8');

test('unverified public signup cannot generate tenant keys', () => {
  assert.equal(publicRoute.includes('Math.random('), false);
  assert.equal(publicRoute.includes('randomBytes(32)'), false);
  assert.match(publicRoute, /Verified onboarding required/);
});

test('database connection URL is never printed, even partially', () => {
  assert.doesNotMatch(pool, /redactDbUrl/);
  assert.equal(pool.includes('console.log(redactDbUrl'), false);
  assert.match(pool, /DATABASE_URL configured:/);
});
