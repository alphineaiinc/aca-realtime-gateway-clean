'use strict';

// Transactional, single-use challenge consumption. The caller supplies a
// dedicated PostgreSQL client and an authorization/provisioning callback.
// This is NOT connected to any HTTP route or live database.
const { verifyChallenge, normalizeEmail, normalizeBusinessName, PURPOSE } = require('./onboardingChallenge');

async function consumeChallengeAndProvision({
  client, token, email, businessName, now = Date.now(), provision,
}) {
  if (!client || typeof client.query !== 'function' || typeof provision !== 'function') {
    throw new TypeError('A database client and provisioning callback are required');
  }
  const normalizedEmail = normalizeEmail(email);
  const normalizedBusinessName = normalizeBusinessName(businessName);
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) ||
      !Number.isSafeInteger(now) || now < 0) {
    return { ok: false, reason: 'invalid_or_expired' };
  }
  const { createHash } = require('node:crypto');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;
    // One conditional UPDATE both claims and consumes the challenge.
    // Database schema must enforce token_hash uniqueness.
    const claimed = await client.query(
      `UPDATE onboarding_challenges
       SET consumed_at = to_timestamp($2 / 1000.0)
       WHERE token_hash = $1
         AND purpose = $3
         AND email = $4
         AND business_name = $5
         AND consumed_at IS NULL
         AND expires_at > to_timestamp($2 / 1000.0)
       RETURNING token_hash, purpose, email, business_name,
                 (EXTRACT(EPOCH FROM expires_at) * 1000)::bigint AS expires_at_ms,
                 NULL::bigint AS consumed_at_ms`,
      [tokenHash, now, PURPOSE, normalizedEmail, normalizedBusinessName]
    );
    if (claimed.rowCount !== 1 || claimed.rows.length !== 1 ||
        !verifyChallenge({
          token,
          challenge: {
            tokenHash: claimed.rows[0].token_hash,
            purpose: claimed.rows[0].purpose,
            email: claimed.rows[0].email,
            businessName: claimed.rows[0].business_name,
            expiresAt: Number(claimed.rows[0].expires_at_ms),
            consumedAt: claimed.rows[0].consumed_at_ms,
          },
          email: normalizedEmail,
          businessName: normalizedBusinessName,
          now,
        })) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return { ok: false, reason: 'invalid_or_expired' };
    }
    // The callback must enforce tenant/business authorization and must use
    // this SAME client for every database operation in the transaction.
    const result = await provision({ client, email: normalizedEmail, businessName: normalizedBusinessName });
    await client.query('COMMIT');
    inTransaction = false;
    return { ok: true, result };
  } catch (error) {
    if (inTransaction) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original failure */ }
    }
    throw error;
  }
}

module.exports = { consumeChallengeAndProvision };
