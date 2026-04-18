"use strict";

function safeObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function getIntentList(clusterSchema) {
  return safeArray(clusterSchema && clusterSchema.intents);
}

function getIntentSchema(clusterSchema, intent) {
  if (!intent) return null;

  const intents = getIntentList(clusterSchema);
  return intents.find((i) => i && i.intent === intent) || null;
}

function validateIntent(clusterSchema, requestedIntent, currentIntent) {
  const intents = getIntentList(clusterSchema);

  if (requestedIntent) {
    const requestedExists = intents.find((i) => i && i.intent === requestedIntent);
    if (requestedExists) return requestedIntent;
  }

  if (currentIntent) {
    const currentExists = intents.find((i) => i && i.intent === currentIntent);
    if (currentExists) return currentIntent;
  }

  return null;
}

function buildAllowedSlotSet(clusterSchema, intentSchema) {
  const allowed = new Set();

  const clusterSlots = safeObject(clusterSchema && clusterSchema.slot_definitions);
  for (const key of Object.keys(clusterSlots)) {
    allowed.add(key);
  }

  const requiredSlots = safeArray(intentSchema && intentSchema.required_slots);
  const optionalSlots = safeArray(intentSchema && intentSchema.optional_slots);

  for (const key of requiredSlots) {
    allowed.add(key);
  }

  for (const key of optionalSlots) {
    allowed.add(key);
  }

  return allowed;
}

function filterSlotUpdates(clusterSchema, intentSchema, updates) {
  const source = safeObject(updates);
  const filtered = {};
  const allowedSlots = buildAllowedSlotSet(clusterSchema, intentSchema);

  for (const [key, value] of Object.entries(source)) {
    if (allowedSlots.has(key)) {
      filtered[key] = value;
    }
  }

  return filtered;
}

function normalizeSlotValue(slotName, value, clusterSchema) {
  const slotDefinitions = safeObject(clusterSchema && clusterSchema.slot_definitions);
  const slotDef = safeObject(slotDefinitions[slotName]);

  if (!isFilled(value)) return value;

  const type = slotDef.type || null;

  if (type === "integer" || type === "number") {
    if (typeof value === "number") return value;

    const parsed = Number(String(value).trim());
    if (Number.isFinite(parsed)) return parsed;

    return value;
  }

  if (type === "string" || type === "date" || type === "time" || type === "phone") {
    return String(value).trim();
  }

  return value;
}

function normalizeSlotUpdates(clusterSchema, updates) {
  const normalized = {};

  for (const [key, value] of Object.entries(safeObject(updates))) {
    normalized[key] = normalizeSlotValue(key, value, clusterSchema);
  }

  return normalized;
}

function mergeSlots(currentSlots, updates, corrections) {
  return {
    ...safeObject(currentSlots),
    ...safeObject(updates),
    ...safeObject(corrections),
  };
}

function getNextMissingSlot(intentSchema, slots) {
  if (!intentSchema) return null;

  const required = safeArray(intentSchema.required_slots);

  for (const slot of required) {
    if (!isFilled(slots[slot])) {
      return slot;
    }
  }

  return null;
}

function getConfirmationSlots(intentSchema, slots) {
  if (!intentSchema) return {};

  const confirmationSlotNames = safeArray(intentSchema.confirmation_slots).length
    ? safeArray(intentSchema.confirmation_slots)
    : [
        ...safeArray(intentSchema.required_slots),
        ...safeArray(intentSchema.optional_slots),
      ];

  const output = {};
  for (const slotName of confirmationSlotNames) {
    if (isFilled(slots[slotName])) {
      output[slotName] = slots[slotName];
    }
  }

  return output;
}

function computeWorkflowStatus({
  intent,
  nextMissingSlot,
  handoffRequired,
  confirmationPending,
}) {
  if (handoffRequired) return "handoff_required";
  if (!intent) return "idle";
  if (nextMissingSlot) return "collecting";
  if (confirmationPending) return "ready_for_confirmation";
  return "completed";
}

function computeSessionState(workflowStatus) {
  if (workflowStatus === "handoff_required") return "failed";
  if (workflowStatus === "collecting") return "task_in_progress";
  if (workflowStatus === "ready_for_confirmation") return "ready_for_confirmation";
  if (workflowStatus === "completed") return "completed";
  return "idle";
}

function computeWorkflowState({ clusterSchema, session, extraction }) {
  const safeSession = safeObject(session);
  const safeExtraction = safeObject(extraction);

  const currentIntent = safeSession.active_intent || null;
  const intent = validateIntent(
    clusterSchema,
    safeExtraction.intent || null,
    currentIntent
  );

  const intentSchema = getIntentSchema(clusterSchema, intent);

  const filteredUpdates = filterSlotUpdates(
    clusterSchema,
    intentSchema,
    safeExtraction.slot_updates
  );

  const filteredCorrections = filterSlotUpdates(
    clusterSchema,
    intentSchema,
    safeExtraction.slot_corrections
  );

  const normalizedUpdates = normalizeSlotUpdates(clusterSchema, filteredUpdates);
  const normalizedCorrections = normalizeSlotUpdates(clusterSchema, filteredCorrections);

  const mergedSlots = mergeSlots(
    safeSession.slots || {},
    normalizedUpdates,
    normalizedCorrections
  );

  const nextMissingSlot = getNextMissingSlot(intentSchema, mergedSlots);
  const handoffRequired = Boolean(safeExtraction.handoff_required);
  const confirmationPending = Boolean(intent && !nextMissingSlot);

  const workflowStatus = computeWorkflowStatus({
    intent,
    nextMissingSlot,
    handoffRequired,
    confirmationPending,
  });

  const confirmationSlots = getConfirmationSlots(intentSchema, mergedSlots);
  const state = computeSessionState(workflowStatus);

  return {
    intent,
    intentSchema,
    slots: mergedSlots,
    slotUpdatesApplied: normalizedUpdates,
    slotCorrectionsApplied: normalizedCorrections,
    nextMissingSlot,
    workflowStatus,
    state,
    handoffRequired,
    confirmationPending,
    confirmationSlots,
    intentConfidence:
      typeof safeExtraction.intent_confidence === "number"
        ? safeExtraction.intent_confidence
        : 0,
    answeredRequestedSlot: Boolean(safeExtraction.answered_requested_slot),
    callerGoalSummary: safeExtraction.caller_goal_summary || "",
    safetyFlags: safeArray(safeExtraction.safety_flags),
    notes: safeArray(safeExtraction.notes),
  };
}

module.exports = {
  safeObject,
  safeArray,
  isFilled,
  getIntentSchema,
  validateIntent,
  filterSlotUpdates,
  normalizeSlotUpdates,
  mergeSlots,
  getNextMissingSlot,
  getConfirmationSlots,
  computeWorkflowStatus,
  computeSessionState,
  computeWorkflowState,
};