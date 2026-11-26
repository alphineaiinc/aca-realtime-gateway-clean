"use strict";
// Offline authoring only: never used to infer a tenant's workflow at runtime.
const intake = require("../../config/clusterIntakeSchemas");
const { BUSINESS_SLOT_PROFILES } = require("./businessSlotProfiles");
const { validateWorkflowSchema } = require("./clusterSchemaLoader");
const aliases = { restaurant_hospitality: "restaurant", medical_clinic: "medical", dental_vision: "medical", beauty_salon_spa: "salon" };
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const ids = Object.freeze([...Object.keys(intake), "generic"]);
const types = { party_size: "integer", vehicle_year: "integer", date: "date", time: "time", phone: "phone" };
function buildWorkflowDefinition(id) {
  if (!ids.includes(id)) throw new Error("UNKNOWN_WORKFLOW_ID");
  const profile = BUSINESS_SLOT_PROFILES[aliases[id] || id];
  const config = id === "generic" ? { required: profile.required.filter(s => s !== "intent"), optional: profile.optional, confirmationFields: ["date", "time"] } : intake[id];
  const required = [...config.required], optional = [...config.optional];
  const slots = [...new Set([...required, ...optional])];
  const slot_definitions = Object.fromEntries(slots.map(s => [s, { type: own(types,s) ? types[s] : "string" }]));
  const slotQuestions = Object.fromEntries(slots.map(s => [s, profile.slotQuestions[s] || ("Could you share your " + s.replace(/_/g, " ") + "?")]));
  return validateWorkflowSchema({ cluster_id: id, version: 1, slot_definitions,
    intents: [{ intent: "capture_request", description: "Capture the caller's request details without promising fulfillment.", required_slots: required, optional_slots: optional, confirmation_slots: [...config.confirmationFields] }],
    intake_profile: { required: [...required], optional: [...optional], slotQuestions } });
}
module.exports = { buildWorkflowDefinition, workflowIds: ids };
