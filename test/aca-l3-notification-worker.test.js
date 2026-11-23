"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { claimNext, markDelivered, markFailed, reapExpiredLeases, MAX_ATTEMPTS } = require("../src/voice/notificationOutboxWorker");
const job = { id: 4, tenant_id: 8, attempt_count: 1, locked_until: "2026-12-01T12:00:00Z" };
test("claim uses atomic SKIP LOCKED and returns fencing lease", async () => {
  const pool = { async query(sql, args) {
    assert.match(sql, /FOR UPDATE SKIP LOCKED/);
    assert.match(sql, /attempt_count = o\.attempt_count \+ 1/);
    assert.match(sql, /o\.locked_until/);
    assert.deepEqual(args, [MAX_ATTEMPTS, 120]);
    return { rows: [job] };
  } };
  assert.equal((await claimNext(pool)).locked_until, job.locked_until);
});
test("delivery requires same tenant, attempt and lease token", async () => {
  const pool = { async query(sql, args) {
    assert.match(sql, /status = 'processing'/);
    assert.match(sql, /locked_until = \$4/);
    assert.deepEqual(args, [4, 8, 1, job.locked_until]);
    return { rowCount: 1 };
  } };
  assert.equal(await markDelivered(pool, job, job.locked_until), true);
  await assert.rejects(markDelivered(pool, job, null), /lease_required/);
});
test("failure uses bounded backoff and dead-letters on final attempt", async () => {
  for (const attempts of [1, MAX_ATTEMPTS]) {
    const item = { ...job, attempt_count: attempts };
    const pool = { async query(sql, args) {
      assert.match(sql, /next_attempt_at = NOW\(\)/);
      assert.equal(args[4], attempts === MAX_ATTEMPTS ? "dead_letter" : "failed");
      assert.equal(args[6], 30 * Math.pow(2, attempts - 1));
      return { rowCount: 1 };
    } };
    assert.equal(await markFailed(pool, item, item.locked_until, "temporary_failure"), true);
  }
});

test("abandoned leases are recovered with bounded locked batches and dead-letter threshold", async () => {
  const pool = { async query(sql, args) {
    assert.match(sql, /status = 'processing' AND locked_until < NOW\(\)/);
    assert.match(sql, /FOR UPDATE SKIP LOCKED LIMIT \$1/);
    assert.match(sql, /CASE WHEN o\.attempt_count >= \$2 THEN 'dead_letter' ELSE 'failed' END/);
    assert.match(sql, /last_error_code = 'lease_expired'/);
    assert.deepEqual(args, [25, MAX_ATTEMPTS]);
    return { rows: [{ id: 7, status: "dead_letter" }] };
  } };
  assert.deepEqual(await reapExpiredLeases(pool, 25), [{ id: 7, status: "dead_letter" }]);
  await assert.rejects(reapExpiredLeases(pool, 0), /invalid_recovery_limit/);
  await assert.rejects(reapExpiredLeases(pool, 501), /invalid_recovery_limit/);
});
test("normal claim excludes processing jobs until lease recovery", async () => {
  const pool = { async query(sql) {
    assert.match(sql, /WHERE status IN \('pending','failed'\)/);
    assert.doesNotMatch(sql, /OR \(status = 'processing'/);
    return { rows: [] };
  } };
  assert.equal(await claimNext(pool), null);
});
