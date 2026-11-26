"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createTenantResolver, isValidatedRoutingContext } = require("../src/voice/tenantResolver");
const { loadClusterSchema } = require("../src/voice/clusterSchemaLoader");

const schema = () => ({
  cluster_id: "general_service",
  version: 1,
  slot_definitions: { reason: { type: "string" }, phone: { type: "phone" } },
  intents: [{ intent: "callback", required_slots: ["reason", "phone"], optional_slots: [], confirmation_slots: ["reason", "phone"] }],
  intake_profile: { required: ["reason", "phone"], optional: [], slotQuestions: { reason: "How can we help?", phone: "Your phone number?" } }
});

test("ACA-01: verified phone selects exactly one tenant and explicit workflow", async () => {
  const statements = [];
  const query = async (sql, args) => {
    statements.push({ sql, args });
    if (sql.includes("FROM public.tenant_phone_numbers")) {
      return { rows: [{ tenant_id: 41, is_active: true, preferred_lang: "en-CA", region: "CA" }] };
    }
    if (sql.includes("FROM public.tenant_workflow_configs")) {
      return { rows: [{ workflow_id: "general_service", workflow_version: 1, is_active: true, definition_active: true, schema_json: schema() }] };
    }
    throw new Error("unexpected SQL");
  };
  const resolve = createTenantResolver({ query });
  const context = await resolve({ calledNumber: "+14165550123", callSid: "CA" + "1".repeat(32), accountSid: "AC" + "2".repeat(32) });
  assert.equal(context.ok, true);
  assert.equal(context.tenantId, 41);
  assert.equal(context.clusterId, "general_service");
  assert.equal(context.languageCode, "en-CA");
  assert.equal(context.calledNumber, "+14165550123");
  assert.equal(isValidatedRoutingContext(context), true);
  assert.equal(loadClusterSchema(context).cluster_id, "general_service");
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.schema.slot_definitions.reason), true);
  assert.equal(statements.length, 2);
  assert.deepEqual(statements[0].args, ["+14165550123"]);
  assert.deepEqual(statements[1].args, [41]);
  assert.throws(() => { context.tenantId = 42; }, TypeError);
});

test("ACA-01: untrusted fabricated context cannot load a workflow", () => {
  const fabricated = { ok: true, tenantId: 41, clusterId: "general_service", schema: schema() };
  assert.equal(isValidatedRoutingContext(fabricated), false);
  assert.throws(() => loadClusterSchema(fabricated), /UNVERIFIED_ROUTING_CONTEXT/);
});

test("ACA-01: malformed and unknown numbers never authorize tenant fallback", async () => {
  const resolve = createTenantResolver({ query: async () => ({ rows: [] }) });
  for (const calledNumber of ["4165550123", "+01", "+", "", null, undefined, "+14165550123x"]) {
    const result = await resolve({ calledNumber });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "INVALID_CALLED_NUMBER");
  }
  const result = await resolve({ calledNumber: "+14165550123" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "UNKNOWN_NUMBER");
});
