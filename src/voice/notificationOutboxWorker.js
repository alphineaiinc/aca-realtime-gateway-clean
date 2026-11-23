"use strict";

// Database-only outbox lifecycle. No SMS, email, or external network calls.
// Worker execution is not scheduled or enabled by importing this module.
const MAX_ATTEMPTS = 5;
const LEASE_SECONDS = 120;

async function claimNext(pool) {
  const result = await pool.query(
    `WITH candidate AS (
       SELECT id FROM aca_notification_outbox
       WHERE status IN ('pending','failed')
         AND next_attempt_at <= NOW()
         AND attempt_count < $1
       ORDER BY next_attempt_at, id
       FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE aca_notification_outbox AS o
     SET status = 'processing',
         attempt_count = o.attempt_count + 1,
         locked_until = date_trunc('milliseconds', NOW() + ($2::integer * INTERVAL '1 second'))
     FROM candidate WHERE o.id = candidate.id
     RETURNING o.id, o.tenant_id, o.intake_request_id, o.event_type, o.attempt_count, o.locked_until`,
    [MAX_ATTEMPTS, LEASE_SECONDS]
  );
  return result.rows[0] || null;
}

async function markDelivered(pool, job, leaseToken) {
  if (!job || !leaseToken) throw new Error("lease_required");
  const result = await pool.query(
    `UPDATE aca_notification_outbox
     SET status = 'delivered', delivered_at = NOW(), locked_until = NULL, last_error_code = NULL
     WHERE id = $1 AND tenant_id = $2 AND status = 'processing'
       AND attempt_count = $3 AND locked_until = $4 AND locked_until > NOW()
     RETURNING id`,
    [job.id, job.tenant_id, job.attempt_count, leaseToken]
  );
  return result.rowCount === 1;
}

async function markFailed(pool, job, leaseToken, code = "delivery_failed") {
  if (!job || !leaseToken) throw new Error("lease_required");
  const attempts = Number(job.attempt_count);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > MAX_ATTEMPTS) throw new Error("invalid_attempt");
  const terminal = attempts >= MAX_ATTEMPTS;
  const backoffSeconds = Math.min(3600, 30 * Math.pow(2, attempts - 1));
  const result = await pool.query(
    `UPDATE aca_notification_outbox
     SET status = $5, locked_until = NULL, last_error_code = $6,
         next_attempt_at = NOW() + ($7::integer * INTERVAL '1 second')
     WHERE id = $1 AND tenant_id = $2 AND status = 'processing'
       AND attempt_count = $3 AND locked_until = $4 AND locked_until > NOW()
     RETURNING id`,
    [job.id, job.tenant_id, attempts, leaseToken,
      terminal ? "dead_letter" : "failed", String(code).slice(0, 64), backoffSeconds]
  );
  return result.rowCount === 1;
}


/**
 * Recover abandoned leases in bounded batches. A final-attempt expiry is
 * dead-lettered rather than silently stranded as "processing".
 * Earlier attempts become retryable only after their next_attempt_at.
 * This never sends a message; delivery outcome remains unknown after a crash.
 */
async function reapExpiredLeases(pool, limit = 100) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("invalid_recovery_limit");
  }
  const result = await pool.query(
    `WITH expired AS (
       SELECT id FROM aca_notification_outbox
       WHERE status = 'processing' AND locked_until < NOW()
       ORDER BY locked_until, id
       FOR UPDATE SKIP LOCKED LIMIT $1
     )
     UPDATE aca_notification_outbox AS o
     SET status = CASE WHEN o.attempt_count >= $2 THEN 'dead_letter' ELSE 'failed' END,
         locked_until = NULL,
         last_error_code = 'lease_expired',
         next_attempt_at = CASE
           WHEN o.attempt_count >= $2 THEN o.next_attempt_at
           ELSE NOW() + (LEAST(3600, 30 * POWER(2, GREATEST(o.attempt_count - 1, 0))) * INTERVAL '1 second')
         END
     FROM expired WHERE o.id = expired.id
     RETURNING o.id, o.status`,
    [limit, MAX_ATTEMPTS]
  );
  return result.rows;
}

module.exports = { MAX_ATTEMPTS, LEASE_SECONDS, claimNext, markDelivered, markFailed, reapExpiredLeases };
