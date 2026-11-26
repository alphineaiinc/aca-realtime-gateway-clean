"use strict";

// Full workflow schemas, never slot-intake profiles or an industry fallback.
const name = /^[a-z][a-z0-9_]{0,63}$/;
const plain = (v) => v && typeof v === "object" && !Array.isArray(v);
function validateWorkflowSchema(schema) {
  if (!plain(schema) || !name.test(schema.cluster_id || "") ||
      !Number.isInteger(schema.version) || schema.version < 1 ||
      !plain(schema.slot_definitions) || !Array.isArray(schema.intents) || !schema.intents.length ||
      !plain(schema.intake_profile) || !Array.isArray(schema.intake_profile.required) ||
      !Array.isArray(schema.intake_profile.optional) || !plain(schema.intake_profile.slotQuestions)) {
    throw new Error("INVALID_WORKFLOW_SCHEMA");
  }
  const slots = Object.keys(schema.slot_definitions);
  if (!slots.length || slots.some((s) => !name.test(s) || !plain(schema.slot_definitions[s]) ||
      !["string", "integer", "number", "date", "time", "phone"].includes(schema.slot_definitions[s].type))) {
    throw new Error("INVALID_WORKFLOW_SCHEMA");
  }
  const validSlots = (list) => Array.isArray(list) && new Set(list).size === list.length &&
    list.every((s) => slots.includes(s));
  const intents = new Set();
  for (const intent of schema.intents) {
    if (!plain(intent) || !name.test(intent.intent || "") || intents.has(intent.intent) ||
        !validSlots(intent.required_slots) || !intent.required_slots.length ||
        !validSlots(intent.optional_slots) || !validSlots(intent.confirmation_slots) ||
        !intent.confirmation_slots.length) throw new Error("INVALID_WORKFLOW_SCHEMA");
    intents.add(intent.intent);
  }
  if (!validSlots(schema.intake_profile.required) || !schema.intake_profile.required.length ||
      !validSlots(schema.intake_profile.optional) ||
      slots.some((s) => typeof schema.intake_profile.slotQuestions[s] !== "string" ||
        !schema.intake_profile.slotQuestions[s].trim())) throw new Error("INVALID_WORKFLOW_SCHEMA");
  return schema;
}
function loadClusterSchema(context) {
  if (!require("./tenantResolver").isValidatedRoutingContext(context)) {
    throw new Error("UNVERIFIED_ROUTING_CONTEXT");
  }
  return validateWorkflowSchema(context.schema);
}
module.exports = { validateWorkflowSchema, loadClusterSchema };
