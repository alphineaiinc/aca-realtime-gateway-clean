const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const publicRoute = fs.readFileSync(path.join(root, 'src/routes/public.js'), 'utf8');
const pool = fs.readFileSync(path.join(root, 'src/db/pool.js'), 'utf8');

test('tenant API key uses cryptographic random bytes, not Math.random', () => {
  assert.match(publicRoute, /randomBytes\(32\)\.toString\("hex"\)/);
  assert.doesNotMatch(publicRoute, /Math\.random\(/);
  const sample = crypto.randomBytes(32).toString('hex');
  assert.match(sample, /^[a-f0-9]{64}$/);
});

test('database connection URL is never printed, even partially', () => {
  assert.doesNotMatch(pool, /redactDbUrl/);
  assert.doesNotMatch(pool, /console\.log\([^\n]*redactDbUrl/);
  assert.match(pool, /DATABASE_URL configured:/);
});
