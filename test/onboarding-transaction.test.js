'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { issueChallenge } = require('../src/security/onboardingChallenge');
const { consumeChallengeAndProvision } = require('../src/security/onboardingTransaction');

function fakeClient(challenge, { claimCount = 1, failProvision = false } = {}) {
  const queries = [];
  const client = {
    queries,
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
      if (sql.includes('UPDATE onboarding_challenges')) {
        return {
          rowCount: claimCount,
          rows: claimCount ? [{
            token_hash: challenge.tokenHash,
            purpose: challenge.purpose,
            email: challenge.email,
            business_name: challenge.businessName,
            expires_at_ms: challenge.expiresAt,
            consumed_at_ms: null,
          }] : [],
        };
      }
      if (sql === 'PROVISION') {
        if (failProvision) throw new Error('db failure');
        return { rows: [{ id: 'new-tenant' }] };
      }
      throw new Error('Unexpected SQL');
    },
  };
  return client;
}

test('successful claim and provisioning use one transaction and normalized identity', async () => {
  const { token, challenge } = issueChallenge({ email: 'owner@example.com', businessName: 'Clinic', now: 1000 });
  const client = fakeClient(challenge);
  const result = await consumeChallengeAndProvision({
    client, token, email: ' OWNER@example.com ', businessName: 'Clinic', now: 1001,
    provision: async ({ client: tx, email }) => {
      assert.equal(tx, client);
      assert.equal(email, 'owner@example.com');
      await tx.query('PROVISION');
      return 'new-tenant';
    },
  });
  assert.deepEqual(result, { ok: true, result: 'new-tenant' });
  assert.equal(client.queries[0].sql, 'BEGIN');
  assert.equal(client.queries.at(-1).sql, 'COMMIT');
  assert.equal(client.queries.some(q => q.sql === 'ROLLBACK'), false);
  assert.equal(client.queries[1].params[0], challenge.tokenHash);
  assert.equal(client.queries[1].params[2], 'tenant-onboarding');
});

test('replay or missing challenge never provisions and rolls back', async () => {
  const { token, challenge } = issueChallenge({ email: 'owner@example.com', businessName: 'Clinic', now: 1000 });
  const client = fakeClient(challenge, { claimCount: 0 });
  let provisioned = false;
  const result = await consumeChallengeAndProvision({
    client, token, email: 'owner@example.com', businessName: 'Clinic', now: 1001,
    provision: async () => { provisioned = true; },
  });
  assert.deepEqual(result, { ok: false, reason: 'invalid_or_expired' });
  assert.equal(provisioned, false);
  assert.deepEqual(client.queries.map(q => q.sql === 'BEGIN' || q.sql === 'ROLLBACK' ? q.sql : 'UPDATE'), ['BEGIN', 'UPDATE', 'ROLLBACK']);
});

test('provisioning failure rolls back the challenge claim and tenant writes', async () => {
  const { token, challenge } = issueChallenge({ email: 'owner@example.com', businessName: 'Clinic', now: 1000 });
  const client = fakeClient(challenge, { failProvision: true });
  await assert.rejects(() => consumeChallengeAndProvision({
    client, token, email: 'owner@example.com', businessName: 'Clinic', now: 1001,
    provision: async ({ client: tx }) => tx.query('PROVISION'),
  }), /db failure/);
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
  assert.equal(client.queries.some(q => q.sql === 'COMMIT'), false);
});

test('invalid token never begins a transaction', async () => {
  const { challenge } = issueChallenge({ email: 'owner@example.com', businessName: 'Clinic', now: 1000 });
  const client = fakeClient(challenge);
  const result = await consumeChallengeAndProvision({
    client, token: 'bad', email: 'owner@example.com', businessName: 'Clinic',
    now: 1001, provision: async () => { throw new Error('must not run'); },
  });
  assert.equal(result.ok, false);
  assert.equal(client.queries.length, 0);
});
