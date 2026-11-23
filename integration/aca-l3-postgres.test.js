"use strict";
// Opt-in, isolated PostgreSQL integration suite. Run ONLY with ACA_TEST_DATABASE_URL
// pointing to a disposable database; never point it at production or staging.
// Does not dispatch notifications or use external providers.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { saveConfirmedIntake } = require("../src/voice/confirmedIntakeStore");
const { claimNext, markDelivered, reapExpiredLeases, MAX_ATTEMPTS } = require("../src/voice/notificationOutboxWorker");
const url = process.env.ACA_TEST_DATABASE_URL;
if (!url) throw new Error("ACA_TEST_DATABASE_URL_required_for_postgres_integration");
if (process.env.ACA_TEST_DATABASE_CONFIRM !== "DISPOSABLE_ONLY") {
  throw new Error("ACA_TEST_DATABASE_CONFIRM_must_equal_DISPOSABLE_ONLY");
}
const db = new URL(url);
if (!["127.0.0.1", "localhost", "::1"].includes(db.hostname)) {
  throw new Error("Postgres integration tests require local disposable database");
}
if (!db.pathname.slice(1).startsWith("aca_test_")) {
  throw new Error("Postgres integration database name must start with aca_test_");
}
const pool = new Pool({ connectionString: url, max: 6 });
const sid = n => "CA" + n.toString(16).padStart(32, "0");
let tenantId;
test.before(async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS master_tenants (
    id SERIAL PRIMARY KEY, business_name TEXT NOT NULL,
    preferred_lang TEXT, region TEXT
  )`);
  for (const file of ["009_aca_intake_requests.sql", "010_aca_notification_outbox.sql"]) {
    await pool.query(fs.readFileSync(path.join(__dirname, "../migrations", file), "utf8"));
  }
  const result = await pool.query(
    "INSERT INTO master_tenants (business_name) VALUES ($1) RETURNING id",
    ["ACA integration disposable fixture"]
  );
  tenantId = result.rows[0].id;
});
test.after(async () => {
  try {
    if (tenantId) {
      await pool.query("DELETE FROM master_tenants WHERE id = $1", [tenantId]);
    }
  } finally {
    await pool.end();
  }
});
test("confirmed intake/outbox atomicity and duplicate protection", async () => {
  const input = { confirmed: true, tenantId, callSid: sid(1), clusterId: "medical_clinic",
    intent: "appointment", slots: { date: "2026-12-01", time: "10:00", name: "Test", phone: "5550100" } };
  const a = await saveConfirmedIntake(pool, input);
  const b = await saveConfirmedIntake(pool, input);
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(String(a.request.id), String(b.request.id));
  const counts = await pool.query(
    `SELECT (SELECT COUNT(*)::int FROM aca_intake_requests WHERE tenant_id=$1 AND call_sid=$2) AS requests,
            (SELECT COUNT(*)::int FROM aca_notification_outbox WHERE tenant_id=$1 AND intake_request_id=$3) AS events`,
    [tenantId, input.callSid, a.request.id]
  );
  assert.equal(counts.rows[0].requests, 1);
  assert.equal(counts.rows[0].events, 1);
});
test("concurrent claims fence competing workers", async () => {
  const input = { confirmed: true, tenantId, callSid: sid(2), clusterId: "medical_clinic",
    slots: { name: "Test", date: "2026-12-01", time: "10:00" } };
  const a = await saveConfirmedIntake(pool, input);
  const [one, two] = await Promise.all([claimNext(pool), claimNext(pool)]);
  const claimed = [one, two].filter(Boolean);
  assert.equal(new Set(claimed.map(x => String(x.id))).size, claimed.length);
  assert.ok(claimed.some(x => String(x.intake_request_id) === String(a.request.id)));
  const mine = claimed.find(x => String(x.intake_request_id) === String(a.request.id));
  assert.equal(await markDelivered(pool, mine, mine.locked_until), true);
  assert.equal(await markDelivered(pool, mine, mine.locked_until), false);
});
test("expired fifth attempt dead-letters and cannot be acknowledged", async () => {
  const input = { confirmed: true, tenantId, callSid: sid(3), clusterId: "medical_clinic",
    slots: { name: "Test", date: "2026-12-01", time: "10:00" } };
  const saved = await saveConfirmedIntake(pool, input);
  await pool.query(
    `UPDATE aca_notification_outbox SET status='processing', attempt_count=$1,
       locked_until=NOW()-INTERVAL '5 seconds'
     WHERE intake_request_id=$2 AND tenant_id=$3`,
    [MAX_ATTEMPTS, saved.request.id, tenantId]
  );
  const result = await reapExpiredLeases(pool);
  assert.ok(result.some(x => x.status === "dead_letter"));
  const status = await pool.query(
    "SELECT status FROM aca_notification_outbox WHERE intake_request_id=$1 AND tenant_id=$2",
    [saved.request.id, tenantId]
  );
  assert.equal(status.rows[0].status, "dead_letter");
});
