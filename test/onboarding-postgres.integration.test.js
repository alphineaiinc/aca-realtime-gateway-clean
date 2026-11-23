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
