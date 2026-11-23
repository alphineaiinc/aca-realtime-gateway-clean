const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const publicRoute = fs.readFileSync(path.join(root, 'src/routes/public.js'), 'utf8');
const pool = fs.readFileSync(path.join(root, 'src/db/pool.js'), 'utf8');

test('unverified public signup cannot generate tenant keys', () => {
  assert.doesNotMatch(publicRoute, /Math\.random\(/);
  assert.doesNotMatch(publicRoute, /randomBytes\(32\)/);
  assert.match(publicRoute, /Verified onboarding required/);
});

test('database connection URL is never printed, even partially', () => {
  assert.doesNotMatch(pool, /redactDbUrl/);
  assert.doesNotMatch(pool, /console\.log\([^\n]*redactDbUrl/);
  assert.match(pool, /DATABASE_URL configured:/);
});
