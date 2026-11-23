'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PURPOSE, DEFAULT_TTL_MS, MAX_TTL_MS,
  normalizeEmail, normalizeBusinessName, issueChallenge, verifyChallenge,
} = require('../src/security/onboardingChallenge');

test('normalization rejects invalid identity and business inputs', () => {
  assert.equal(normalizeEmail('  OWNER@Example.COM  '), 'owner@example.com');
  assert.equal(normalizeBusinessName('  Example Clinic  '), 'Example Clinic');
  for (const value of ['', 'a@', '@example.com', null, 12, 'a b@example.com']) {
    assert.throws(() => normalizeEmail(value));
  }
  for (const value of ['', '  ', null, 23, 'x'.repeat(161)]) {
    assert.throws(() => normalizeBusinessName(value));
  }
});

test('challenge contains a secure opaque token and only its hash is stored', () => {
  const { token, challenge } = issueChallenge({
    email: 'Owner@Example.com', businessName: 'Example Clinic', now: 1000,
  });
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(token, challenge.tokenHash);
  assert.equal(challenge.purpose, PURPOSE);
  assert.equal(challenge.email, 'owner@example.com');
  assert.equal(challenge.businessName, 'Example Clinic');
  assert.equal(challenge.expiresAt, 1000 + DEFAULT_TTL_MS);
  assert.equal(challenge.consumedAt, null);
  assert.equal(verifyChallenge({
    token, challenge, email: 'OWNER@example.com', businessName: 'Example Clinic', now: 1001,
  }), true);
});

test('expired, consumed, tampered, wrong-purpose or cross-tenant challenges fail closed', () => {
  const { token, challenge } = issueChallenge({
    email: 'owner@example.com', businessName: 'Example Clinic', now: 1000,
  });
  const args = { token, challenge, email: 'owner@example.com', businessName: 'Example Clinic', now: 1001 };
  assert.equal(verifyChallenge({ ...args, token: 'a'.repeat(64) }), false);
  assert.equal(verifyChallenge({ ...args, token: 'not-a-token' }), false);
  assert.equal(verifyChallenge({ ...args, email: 'other@example.com' }), false);
  assert.equal(verifyChallenge({ ...args, businessName: 'Other Clinic' }), false);
  assert.equal(verifyChallenge({ ...args, now: challenge.expiresAt }), false);
  assert.equal(verifyChallenge({ ...args, challenge: { ...challenge, consumedAt: 1000 } }), false);
  assert.equal(verifyChallenge({ ...args, challenge: { ...challenge, purpose: 'login' } }), false);
  assert.equal(verifyChallenge({ ...args, challenge: { ...challenge, tokenHash: 'bad' } }), false);
  assert.equal(verifyChallenge({ ...args, challenge: null }), false);
});

test('challenge timing is bounded and invalid input never generates a token', () => {
  for (const ttlMs of [-1, 0, MAX_TTL_MS + 1, NaN]) {
    assert.throws(() => issueChallenge({
      email: 'owner@example.com', businessName: 'Example Clinic', now: 1000, ttlMs,
    }));
  }
  assert.throws(() => issueChallenge({ email: 'bad', businessName: 'Example Clinic' }));
});
