'use strict';

// Pure, provider-independent building blocks for a future verified onboarding
// workflow. This module is NOT wired to public routes or production delivery.
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');

const PURPOSE = 'tenant-onboarding';
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_TTL_MS = 15 * 60 * 1000;

function normalizeEmail(value) {
  if (typeof value !== 'string') throw new TypeError('Invalid email');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&\x27*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email)) {
    throw new TypeError('Invalid email');
  }
  return email;
}

function normalizeBusinessName(value) {
  if (typeof value !== 'string') throw new TypeError('Invalid business name');
  const name = value.trim();
  if (!name || name.length > 160) throw new TypeError('Invalid business name');
  return name;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

function issueChallenge({ email, businessName, now = Date.now(), ttlMs = DEFAULT_TTL_MS }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedBusinessName = normalizeBusinessName(businessName);
  if (!Number.isSafeInteger(now) || now < 0 ||
      !Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
    throw new RangeError('Invalid challenge timing');
  }
  const token = randomBytes(32).toString('hex');
  const challenge = {
    purpose: PURPOSE,
    email: normalizedEmail,
    businessName: normalizedBusinessName,
    tokenHash: sha256(token).toString('hex'),
    expiresAt: now + ttlMs,
    consumedAt: null,
  };
  return { token, challenge };
}

// This checks a record but does not consume it. The persistence layer MUST
// atomically consume a challenge with a conditional UPDATE/DELETE before
// provisioning, preventing concurrent replay. Never trust this alone.
function verifyChallenge({ token, challenge, email, businessName, now = Date.now() }) {
  if (!challenge || challenge.purpose !== PURPOSE || challenge.consumedAt != null ||
      !Number.isSafeInteger(challenge.expiresAt) ||
      !Number.isSafeInteger(now) || now >= challenge.expiresAt ||
      typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) ||
      typeof challenge.tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(challenge.tokenHash)) {
    return false;
  }
  let normalizedEmail, normalizedBusinessName;
  try {
    normalizedEmail = normalizeEmail(email);
    normalizedBusinessName = normalizeBusinessName(businessName);
  } catch {
    return false;
  }
  if (normalizedEmail !== challenge.email || normalizedBusinessName !== challenge.businessName) {
    return false;
  }
  return timingSafeEqual(sha256(token), Buffer.from(challenge.tokenHash, 'hex'));
}

module.exports = {
  PURPOSE,
  DEFAULT_TTL_MS,
  MAX_TTL_MS,
  normalizeEmail,
  normalizeBusinessName,
  issueChallenge,
  verifyChallenge,
};
