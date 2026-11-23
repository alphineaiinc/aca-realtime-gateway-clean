'use strict';

// Optional staging-only integration test. No database access unless an operator
// explicitly sets ONBOARDING_STAGING_DATABASE_URL and enables this test.
// Uses disposable challenge rows and rolls back provisioning fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { issueChallenge } = require('../src/security/onboardingChallenge');
const { consumeChallengeAndProvision } = require('../src/security/onboardingTransaction');

const connectionString = process.env.ONBOARDING_STAGING_DATABASE_URL;
const enabled = process.env.RUN_ONBOARDING_STAGING_INTEGRATION === '1';
const integration = enabled && connectionString ? test : test.skip;

integration('two concurrent consumers cannot claim the same challenge', async () => {
  const pool = new Pool({ connectionString, max: 3 });
  const { token, challenge } = issueChallenge({
    email: 'test-' + randomBytes(8).toString('hex') + '@example.invalid',
    businessName: 'Disposable Clinic',
  });
  try {
    // Schema must be applied manually to an isolated staging database first.
    await pool.query(
      `INSERT INTO onboarding_challenges
         (token_hash, purpose, email, business_name, expires_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))`,
      [challenge.tokenHash, challenge.purpose, challenge.email,
        challenge.businessName, challenge.expiresAt]
    );
    const run = async () => {
      const client = await pool.connect();
      try {
        return await consumeChallengeAndProvision({
          client, token, email: challenge.email, businessName: challenge.businessName,
          provision: async () => 'authorized-test-fixture',
        });
      } finally {
        client.release();
      }
    };
    const results = await Promise.all([run(), run()]);
    assert.equal(results.filter(r => r.ok).length, 1);
    assert.equal(results.filter(r => !r.ok).length, 1);
    const row = await pool.query(
      'SELECT consumed_at FROM onboarding_challenges WHERE token_hash = $1',
      [challenge.tokenHash]
    );
    assert.ok(row.rows[0].consumed_at);
  } finally {
    await pool.query('DELETE FROM onboarding_challenges WHERE token_hash = $1', [challenge.tokenHash]);
    await pool.end();
  }
});

integration('provisioning failure rolls back claim and allows a later authorized retry', async () => {
  const pool = new Pool({ connectionString, max: 2 });
  const { token, challenge } = issueChallenge({
    email: 'rollback-' + randomBytes(8).toString('hex') + '@example.invalid',
    businessName: 'Rollback Clinic',
  });
  try {
    await pool.query(
      `INSERT INTO onboarding_challenges
         (token_hash, purpose, email, business_name, expires_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))`,
      [challenge.tokenHash, challenge.purpose, challenge.email,
        challenge.businessName, challenge.expiresAt]
    );
    const client = await pool.connect();
    try {
      await assert.rejects(() => consumeChallengeAndProvision({
        client, token, email: challenge.email, businessName: challenge.businessName,
        provision: async ({ client: tx }) => {
          await tx.query('SELECT 1');
          throw new Error('simulated provisioning failure');
        },
      }), /simulated provisioning failure/);
    } finally {
      client.release();
    }
    const unconsumed = await pool.query(
      'SELECT consumed_at FROM onboarding_challenges WHERE token_hash = $1',
      [challenge.tokenHash]
    );
    assert.equal(unconsumed.rows[0].consumed_at, null);
    const retryClient = await pool.connect();
    try {
      const retry = await consumeChallengeAndProvision({
        client: retryClient, token, email: challenge.email,
        businessName: challenge.businessName,
        provision: async ({ client: tx }) => {
          await tx.query('SELECT 1');
          return 'retry-authorized';
        },
      });
      assert.deepEqual(retry, { ok: true, result: 'retry-authorized' });
    } finally {
      retryClient.release();
    }
    const consumed = await pool.query(
      'SELECT consumed_at FROM onboarding_challenges WHERE token_hash = $1',
      [challenge.tokenHash]
    );
    assert.ok(consumed.rows[0].consumed_at);
  } finally {
    await pool.query('DELETE FROM onboarding_challenges WHERE token_hash = $1', [challenge.tokenHash]);
    await pool.end();
  }
});

integration('wrong tenant binding cannot consume a valid challenge', async () => {
  const pool = new Pool({ connectionString, max: 2 });
  const { token, challenge } = issueChallenge({
    email: 'binding-' + randomBytes(8).toString('hex') + '@example.invalid',
    businessName: 'Authorized Clinic',
  });
  try {
    await pool.query(
      `INSERT INTO onboarding_challenges
         (token_hash, purpose, email, business_name, expires_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))`,
      [challenge.tokenHash, challenge.purpose, challenge.email,
        challenge.businessName, challenge.expiresAt]
    );
    const client = await pool.connect();
    try {
      const denied = await consumeChallengeAndProvision({
        client, token, email: challenge.email, businessName: 'Different Clinic',
        provision: async () => { throw new Error('must not provision'); },
      });
      assert.deepEqual(denied, { ok: false, reason: 'invalid_or_expired' });
    } finally {
      client.release();
    }
    const row = await pool.query(
      'SELECT consumed_at FROM onboarding_challenges WHERE token_hash = $1',
      [challenge.tokenHash]
    );
    assert.equal(row.rows[0].consumed_at, null);
  } finally {
    await pool.query('DELETE FROM onboarding_challenges WHERE token_hash = $1', [challenge.tokenHash]);
    await pool.end();
  }
});
