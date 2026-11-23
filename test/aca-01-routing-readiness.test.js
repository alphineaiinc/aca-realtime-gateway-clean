"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createTenantResolver } = require("../src/voice/tenantResolver");
const { validateWorkflowSchema } = require("../src/voice/clusterSchemaLoader");

function workflow() {
  return {
    cluster_id: "general_service", version: 1,
    slot_definitions: { reason: { type: "string" }, phone: { type: "phone" } },
    intents: [{ intent: "callback", required_slots: ["reason", "phone"], optional_slots: [], confirmation_slots: ["reason"] }],
    intake_profile: { required: ["reason", "phone"], optional: [], slotQuestions: { reason: "What can we help with?", phone: "What is your phone number?" } }
  };
}

test("ACA-01: valid industry-neutral workflow requires explicit complete schema", () => {
  assert.equal(validateWorkflowSchema(workflow()).cluster_id, "general_service");
  assert.throws(() => validateWorkflowSchema({ required: ["reason", "phone"] }), /INVALID_WORKFLOW_SCHEMA/);
  const missingQuestion = workflow();
  delete missingQuestion.intake_profile.slotQuestions.phone;
  assert.throws(() => validateWorkflowSchema(missingQuestion), /INVALID_WORKFLOW_SCHEMA/);
});

test("ACA-01: missing, inactive, and mismatched tenant workflow assignments fail closed", async () => {
  for (const mode of ["missing", "inactive", "mismatch", "database_failure"]) {
    const query = async (sql, values) => {
      if (mode === "database_failure") throw new Error("synthetic database failure");
      if (sql.includes("tenant_phone_numbers")) return { rows: [{ tenant_id: 41, is_active: true, preferred_lang: "en-CA", region: "CA" }] };
      if (sql.includes("tenant_workflow_configs")) {
        if (mode === "missing") return { rows: [] };
        return { rows: [{ workflow_id: "general_service", workflow_version: 1, is_active: mode !== "inactive", definition_active: true,
          schema_json: mode === "mismatch" ? { ...workflow(), cluster_id: "other_service" } : workflow() }] };
      }
      throw new Error("Unexpected query");
    };
    const resolve = createTenantResolver({ query });
    const result = await resolve({ calledNumber: "+14165550123", callSid: "CA" + "1".repeat(32), accountSid: "AC" + "2".repeat(32) });
    assert.equal(result.ok, false, mode);
    assert.equal(result.tenantId, undefined, mode);
  }
});

test("ACA-01: caller-provided tenant or business identity never overrides verified number", async () => {
  let queries = 0;
  const resolve = createTenantResolver({ query: async () => { queries++; throw new Error("should not query"); } });
  for (const key of ["tenantId", "tenant_id", "businessId", "business_id", "customParameters"]) {
    const result = await resolve({ calledNumber: "+14165550123", [key]: key === "customParameters" ? { tenantId: 41 } : 41 });
    assert.equal(result.ok, false, key);
    assert.equal(result.reason, "UNTRUSTED_IDENTIFIER", key);
  }
  assert.equal(queries, 0);
});
