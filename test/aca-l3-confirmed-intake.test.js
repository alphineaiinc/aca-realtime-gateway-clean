"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { saveConfirmedIntake } = require("../src/voice/confirmedIntakeStore");
const callSid = "CA" + "a".repeat(32);
const base = { confirmed: true, tenantId: 3, callSid, clusterId: "medical_clinic", intent: "appointment", slots: { name: "Caller", date: "2026-12-01", time: "10:00" } };
function mock({ duplicate = false, failOutbox = false } = {}) {
  const queries = [];
  let released = 0;
  const request = { id: 9, tenant_id: 3, call_sid: callSid };
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes("INSERT INTO aca_intake_requests")) return { rows: duplicate ? [] : [request] };
      if (sql.includes("SELECT id, tenant_id, call_sid")) return { rows: [request] };
      if (sql.includes("INSERT INTO aca_notification_outbox")) {
        if (failOutbox) throw new Error("outbox unavailable");
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() { released++; }
  };
  return { pool: { async connect() { return client; } }, queries, released: () => released };
}
test("rejects unconfirmed and malformed requests before opening a connection", async () => {
  let count = 0;
  const pool = { async connect() { count++; throw Error("unexpected"); } };
  for (const input of [{ ...base, confirmed: false }, { ...base, tenantId: 0 }, { ...base, callSid: "invalid" }, { ...base, slots: {} }]) {
    await assert.rejects(saveConfirmedIntake(pool, input));
  }
  assert.equal(count, 0);
});
test("persists intake and outbox in one transaction without dispatch", async () => {
  const h = mock();
  const result = await saveConfirmedIntake(h.pool, base);
  assert.equal(result.created, true);
  assert.deepEqual(h.queries.map(x => x.sql === "BEGIN" ? "BEGIN" : x.sql === "COMMIT" ? "COMMIT" : x.sql.includes("aca_notification_outbox") ? "OUTBOX" : "INTAKE"), ["BEGIN", "INTAKE", "OUTBOX", "COMMIT"]);
  assert.deepEqual(h.queries[1].params.slice(0, 3), [3, callSid, "medical_clinic"]);
  assert.deepEqual(h.queries[2].params, [3, 9]);
  assert.match(h.queries[2].sql, /ON CONFLICT \(intake_request_id, event_type\) DO NOTHING/);
  assert.equal(h.released(), 1);
});
test("duplicate call returns existing request and deduplicates notification", async () => {
  const h = mock({ duplicate: true });
  const result = await saveConfirmedIntake(h.pool, base);
  assert.equal(result.created, false);
  assert.deepEqual(h.queries.map(x => x.sql.includes("aca_notification_outbox") ? "OUTBOX" : x.sql.includes("SELECT") ? "SELECT" : x.sql), ["BEGIN", h.queries[1].sql, "SELECT", "OUTBOX", "COMMIT"]);
  assert.equal(h.released(), 1);
});
test("outbox failure rolls back confirmed intake rather than losing notification intent", async () => {
  const h = mock({ failOutbox: true });
  await assert.rejects(saveConfirmedIntake(h.pool, base), /outbox unavailable/);
  assert.equal(h.queries.some(x => x.sql === "COMMIT"), false);
  assert.equal(h.queries.at(-1).sql, "ROLLBACK");
  assert.equal(h.released(), 1);
});
