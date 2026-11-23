"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { saveConfirmedIntake } = require("../src/voice/confirmedIntakeStore");
const callSid = "CA" + "a".repeat(32);
const base = { confirmed: true, tenantId: 3, callSid, clusterId: "medical_clinic", intent: "appointment", slots: { name: "Caller", date: "2026-12-01", time: "10:00" } };
test("rejects unconfirmed, invalid tenant and malformed call IDs without database writes", async () => {
  let count = 0;
  const pool = { async query() { count++; return { rows: [] }; } };
  for (const input of [{ ...base, confirmed: false }, { ...base, tenantId: 0 }, { ...base, callSid: "not-a-call" }, { ...base, slots: {} }]) {
    await assert.rejects(saveConfirmedIntake(pool, input));
  }
  assert.equal(count, 0);
});
test("writes only tenant-scoped parameterized confirmed request", async () => {
  const calls = [];
  const pool = { async query(sql, params) { calls.push({ sql, params }); return { rows: [{ id: 9, tenant_id: 3, call_sid: callSid }] }; } };
  const result = await saveConfirmedIntake(pool, base);
  assert.equal(result.created, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /ON CONFLICT \(tenant_id, call_sid\) DO NOTHING/);
  assert.deepEqual(calls[0].params.slice(0, 3), [3, callSid, "medical_clinic"]);
});
test("duplicate call returns original row without second write", async () => {
  const queries = [];
  const pool = { async query(sql) { queries.push(sql); return { rows: queries.length === 1 ? [] : [{ id: 7, tenant_id: 3, call_sid: callSid }] }; } };
  const result = await saveConfirmedIntake(pool, base);
  assert.equal(result.created, false);
  assert.equal(result.request.id, 7);
  assert.equal(queries.length, 2);
  assert.match(queries[1], /WHERE tenant_id = \$1 AND call_sid = \$2/);
});
