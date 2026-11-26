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
  for (const file of ["009_aca_intake_requests.sql", "010_aca_notification_outbox.sql", "011_aca_notification_recipients.sql", "012_aca_notification_simulations.sql"]) {
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

test("concurrent duplicate intake inserts create one request and one event", async () => {
  const input = { confirmed: true, tenantId, callSid: sid(4), clusterId: "medical_clinic",
    slots: { name: "Test", date: "2026-12-01", time: "10:00" } };
  const results = await Promise.all([saveConfirmedIntake(pool, input), saveConfirmedIntake(pool, input)]);
  assert.equal(results.filter(x => x.created).length, 1);
  const counts = await pool.query(
    `SELECT (SELECT COUNT(*)::int FROM aca_intake_requests WHERE tenant_id=$1 AND call_sid=$2) AS requests,
            (SELECT COUNT(*)::int FROM aca_notification_outbox o
               JOIN aca_intake_requests r ON r.id=o.intake_request_id
               WHERE r.tenant_id=$1 AND r.call_sid=$2) AS events`,
    [tenantId, input.callSid]
  );
  assert.deepEqual(counts.rows[0], { requests: 1, events: 1 });
});
test("outbox SQL failure rolls back confirmed request", async () => {
  const input = { confirmed: true, tenantId, callSid: sid(5), clusterId: "medical_clinic",
    slots: { name: "Test", date: "2026-12-01", time: "10:00" } };
  // Disposable DB only: trigger rejects the matching tenant's notification event.
  await pool.query(`CREATE OR REPLACE FUNCTION aca_test_reject_outbox() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.tenant_id = ${Number(tenantId)} THEN
        RAISE EXCEPTION 'test forced outbox failure';
      END IF;
      RETURN NEW;
    END $$`);
  await pool.query(`CREATE TRIGGER aca_test_outbox_reject BEFORE INSERT
    ON aca_notification_outbox FOR EACH ROW EXECUTE FUNCTION aca_test_reject_outbox()`);
  try {
    await assert.rejects(saveConfirmedIntake(pool, input), /test forced outbox failure/);
    const result = await pool.query(
      "SELECT COUNT(*)::int AS count FROM aca_intake_requests WHERE tenant_id=$1 AND call_sid=$2",
      [tenantId, input.callSid]
    );
    assert.equal(result.rows[0].count, 0);
  } finally {
    await pool.query("DROP TRIGGER aca_test_outbox_reject ON aca_notification_outbox");
    await pool.query("DROP FUNCTION aca_test_reject_outbox()");
  }
});

test("database rejects outbox references belonging to another tenant", async () => {
  const other = (await pool.query("INSERT INTO master_tenants (business_name) VALUES ('Other fixture') RETURNING id")).rows[0].id;
  try {
    const request = (await pool.query(
      "INSERT INTO aca_intake_requests (tenant_id,call_sid,cluster_id,slots) VALUES ($1,$2,'medical_clinic','{}') RETURNING id",
      [tenantId,sid(6)]
    )).rows[0];
    await assert.rejects(pool.query(
      "INSERT INTO aca_notification_outbox (tenant_id,intake_request_id,event_type) VALUES ($1,$2,'intake.confirmed')",
      [other,request.id]
    ), error => error.code === "23503");
  } finally {
    await pool.query("DELETE FROM master_tenants WHERE id=$1",[other]);
  }
});

test("recipient planning excludes other tenants, revoked and unverified recipients", async () => {
  const { planNotification } = require("../src/voice/notificationRecipientPlanner");
  const other = (await pool.query("INSERT INTO master_tenants (business_name) VALUES ('Other fixture') RETURNING id")).rows[0].id;
  try {
    const saved = await saveConfirmedIntake(pool, { confirmed:true, tenantId, callSid:sid(7), clusterId:"medical_clinic", slots:{name:"Fixture"} });
    const job = (await pool.query("SELECT id FROM aca_notification_outbox WHERE intake_request_id=$1",[saved.request.id])).rows[0];
    await pool.query("INSERT INTO aca_notification_recipients (tenant_id,channel,destination,verified_at,consent_at,enabled) VALUES ($1,'email','fixture@example.invalid',NOW(),NOW(),true),($2,'email','other@example.invalid',NOW(),NOW(),true)",[tenantId,other]);
    await pool.query("INSERT INTO aca_notification_recipients (tenant_id,channel,destination) VALUES ($1,'email','unverified@example.invalid')",[tenantId]);
    await assert.rejects(pool.query("UPDATE aca_notification_recipients SET enabled=true WHERE tenant_id=$1 AND verified_at IS NULL",[tenantId]),e=>e.code==="23514");
    const plans = await planNotification(pool,tenantId,job.id);
    assert.equal(plans.length,1);
    assert.equal(plans[0].mode,"dry_run_only");
    assert.equal("destination" in plans[0],false);
    assert.deepEqual(await planNotification(pool,other,job.id),[]);
    await pool.query("UPDATE aca_notification_recipients SET enabled=false,revoked_at=NOW() WHERE tenant_id=$1",[tenantId]);
    assert.deepEqual(await planNotification(pool,tenantId,job.id),[]);
  } finally {
    await pool.query("DELETE FROM master_tenants WHERE id=$1",[other]);
  }
});

test("simulated delivery is durable, deduplicated and never marks actual delivery", async () => {
  const {simulateNotification}=require("../src/voice/notificationSimulation");
  const saved=await saveConfirmedIntake(pool,{confirmed:true,tenantId,callSid:sid(8),clusterId:"medical_clinic",slots:{name:"Fixture"}});
  const job=(await pool.query("SELECT id FROM aca_notification_outbox WHERE intake_request_id=$1",[saved.request.id])).rows[0];
  await pool.query("INSERT INTO aca_notification_recipients (tenant_id,channel,destination,verified_at,consent_at,enabled) VALUES ($1,'sms','+14165550100',NOW(),NOW(),true)",[tenantId]);
  const results=await Promise.all([simulateNotification(pool,tenantId,job.id),simulateNotification(pool,tenantId,job.id)]);
  assert.equal(results.reduce((sum,x)=>sum+x.created,0),1);
  const state=(await pool.query("SELECT status FROM aca_notification_outbox WHERE id=$1",[job.id])).rows[0];
  assert.equal(state.status,"pending");
  assert.equal((await simulateNotification(pool,tenantId,job.id)).created,0);
  assert.equal((await simulateNotification(pool,tenantId+10000,job.id)).created,0);
});
