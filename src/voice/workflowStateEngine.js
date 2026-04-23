// src/voice/workflowStateEngine.js
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

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeOrdinalDay(value) {
  const text = normalizeText(value).toLowerCase();
  return text.replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, "$1");
}

function normalizeDateLikeValue(value) {
  let text = normalizeOrdinalDay(value);
  if (!text) return text;

  text = text
    .replace(/\bof\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function normalizeTimeLikeValue(value) {
  let text = normalizeText(value).toLowerCase();
  if (!text) return text;

  text = text
    .replace(/\bo'?clock\b/g, ":00")
    .replace(/\bp\.?\s*m\.?\b/g, "PM")
    .replace(/\ba\.?\s*m\.?\b/g, "AM")
    .replace(/\s+/g, " ")
    .trim();

  const withEvening = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:in the )?(evening|night)\b/i);
  if (withEvening) {
    const hour = Number(withEvening[1]);
    const mins = withEvening[2] || "00";
    const normalizedHour = hour >= 12 ? hour : hour + 12;
    return `${normalizedHour}:${mins}`;
  }

  const withMorning = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:in the )?morning\b/i);
  if (withMorning) {
    const hour = Number(withMorning[1]);
    const mins = withMorning[2] || "00";
    return `${hour}:${mins} AM`;
  }

  const withAfternoon = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:in the )?afternoon\b/i);
  if (withAfternoon) {
    const hour = Number(withAfternoon[1]);
    const mins = withAfternoon[2] || "00";
    const normalizedHour = hour >= 12 ? hour : hour + 12;
    return `${normalizedHour}:${mins}`;
  }

  return text;
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

  if (slotName && /date|day/i.test(slotName)) {
    return normalizeDateLikeValue(value);
  }

  if (slotName && /time/i.test(slotName)) {
    return normalizeTimeLikeValue(value);
  }

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
    if (
  !isFilled(slots[slot]) ||
  (slot === "time" && /^(am|pm)$/i.test(slots[slot]))
) {
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

function scoreDateSpecificity(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return 0;

  if (
    /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2}\b/i.test(text)
  ) {
    return 3;
  }

  if (
    /\b\d{1,2}\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/i.test(text)
  ) {
    return 3;
  }

  if (
    /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text)
  ) {
    return 2;
  }

  if (/^\d{1,2}$/.test(text)) {
    return 1;
  }

  return 0;
}

function shouldKeepExistingSlot(existingValue, newValue, slotName, extraction) {
  if (!isFilled(existingValue)) return false;
  if (!isFilled(newValue)) return true;

  const corrections = safeObject(extraction && extraction.slot_corrections);
  if (Object.prototype.hasOwnProperty.call(corrections, slotName)) {
    return false;
  }

  const existing = normalizeText(existingValue).toLowerCase();
  const incoming = normalizeText(newValue).toLowerCase();

  if (!incoming) return true;
  if (existing === incoming) return true;

  if (/date|day/i.test(slotName)) {
    const existingScore = scoreDateSpecificity(existing);
    const incomingScore = scoreDateSpecificity(incoming);

    if (incomingScore > existingScore) return false;
    if (existingScore > incomingScore) return true;

    return existing.includes(incoming) || incoming.includes(existing);
  }

  if (/time/i.test(slotName)) {
    return existing.includes(incoming) || incoming.includes(existing);
  }

  return false;
}

function mergeSlotsPreferStable(currentSlots, updates, corrections, extraction) {
  const merged = { ...safeObject(currentSlots) };

  for (const [key, value] of Object.entries(safeObject(updates))) {
    if (!shouldKeepExistingSlot(merged[key], value, key, extraction)) {
      merged[key] = value;
    }
  }

  for (const [key, value] of Object.entries(safeObject(corrections))) {
    merged[key] = value;
  }

  return merged;
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

const rawSlotUpdates =
  safeExtraction.slot_updates ||
  safeExtraction.slots ||
  {};

const filteredUpdates = filterSlotUpdates(
  clusterSchema,
  intentSchema,
  rawSlotUpdates
);

const filteredCorrections = filterSlotUpdates(
  clusterSchema,
  intentSchema,
  safeExtraction.slot_corrections
);

  const normalizedUpdates = normalizeSlotUpdates(clusterSchema, filteredUpdates);
  const normalizedCorrections = normalizeSlotUpdates(clusterSchema, filteredCorrections);

  const mergedSlots = mergeSlotsPreferStable(
    safeSession.slots || {},
    normalizedUpdates,
    normalizedCorrections,
    safeExtraction
  );

  const nextMissingSlot = getNextMissingSlot(intentSchema, mergedSlots);
  const handoffRequired = Boolean(safeExtraction.handoff_required);
  const hasWeakTime =
  typeof mergedSlots.time === "string" &&
  /^(am|pm)$/i.test(mergedSlots.time);

const confirmationPending = Boolean(
  intent &&
  !nextMissingSlot &&
  !hasWeakTime
);

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