// Regression guard for CodeQL js/xss-through-exception (#6).
// This deliberately checks both error paths; dynamic Stripe integration tests
// remain necessary before this branch can be considered release-ready.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'stripeWebhook.js'), 'utf8');

test('Stripe signature failure does not reflect raw exception text', () => {
  assert.match(source, /return res\.status\(400\)\.send\("Webhook signature verification failed"\)/);
  assert.doesNotMatch(source, /res\.status\(400\)\.send\(\x60[^\x60]*err\.message/);
});

test('Stripe webhook error handlers do not log raw exceptions', () => {
  assert.doesNotMatch(source, /console\.error\([^\n]*err(?:\.message)?\s*\)/);
  assert.doesNotMatch(source, /ERROR processing webhook: \$\{err\.message\}/);
  assert.doesNotMatch(source, /Signature verification failed: \$\{err\.message\}/);
});
