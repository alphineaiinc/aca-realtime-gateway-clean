"use strict";

/**
 * src/voice/workflowStateEngine.js
 *
 * Deterministic workflow state handling for ACA live voice flow.
 *
 * Rules:
 * - No hardcoded business-specific logic
 * - Merge multi-slot extraction from a single caller utterance
 * - Preserve already-filled slots unless caller clearly provides a better value
 * - If a partial name becomes a fuller name, overwrite it
 * - If all required slots are filled, move deterministically to ready_for_confirmation
 */

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeWhitespace(text) {
  return safeString(text).replace(/\s+/g, " ").trim();
}

function normalizeName(value) {
  const text = normalizeWhitespace(value);
  if (!text) return "";
  return text
    .replace(/\s+/g, " ")
    .replace(/\b[a-z]/g, (m) => m.toUpperCase());
}

function normalizeTime(value) {
  const text = normalizeWhitespace(value).toLowerCase();
  if (!text) return "";

  return text
    .replace(/\b(p)\.?\s?(m)\.?\b/g, "pm")
    .replace(/\b(a)\.?\s?(m)\.?\b/g, "am")
    .replace(/\s+/g, " ");
}

function normalizeDate(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizePartySize(value) {
  if (value === null || value === undefined) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  const digits = raw.match(/\d+/);
  if (digits) return digits[0];

  return raw.toLowerCase();
}

function normalizeGeneric(value) {
  if (value === null || value === undefined) return "";
  return normalizeWhitespace(String(value));
}

function normalizeSlotValue(slotKey, value) {
  if (value === null || value === undefined) return "";
  const key = String(slotKey || "").toLowerCase();

  if (key.includes("name")) return normalizeName(value);
  if (key.includes("time")) return normalizeTime(value);
  if (key.includes("date") || key.includes("day")) return normalizeDate(value);
  if (
    key.includes("party") ||
    key.includes("size") ||
    key.includes("guest") ||
    key.includes("people") ||
    key.includes("person")
  ) {
    return normalizePartySize(value);
  }

  return normalizeGeneric(value);
}

function getRequiredSlots(schema, workflow) {
  if (Array.isArray(schema?.requiredSlots) && schema.requiredSlots.length) {
    return schema.requiredSlots;
  }
  if (Array.isArray(schema?.slots)) {
    return schema.slots
      .filter((slot) => slot?.required !== false)
      .map((slot) => slot.key)
      .filter(Boolean);
  }
  if (Array.isArray(workflow?.requiredSlots) && workflow.requiredSlots.length) {
    return workflow.requiredSlots;
  }
  return [];
}

function getPromptForSlot(slotKey, schema) {
  if (!slotKey) return "";
  const slotDef = Array.isArray(schema?.slots)
    ? schema.slots.find((s) => s?.key === slotKey)
    : null;
  return safeString(slotDef?.prompt || slotDef?.question || "");
}

function getSlotAliases(schema) {
  const aliases = {};

  if (Array.isArray(schema?.slots)) {
    for (const slot of schema.slots) {
      if (!slot?.key) continue;
      aliases[slot.key] = slot.key;

      if (Array.isArray(slot.aliases)) {
        for (const alias of slot.aliases) {
          if (isNonEmptyString(alias)) aliases[alias] = slot.key;
        }
      }
    }
  }

  return aliases;
}

function canonicalizeExtractedSlots(extractedSlots, schema) {
  if (!isObject(extractedSlots)) return {};

  const aliases = getSlotAliases(schema);
  const out = {};

  for (const [rawKey, rawValue] of Object.entries(extractedSlots)) {
    const canonicalKey = aliases[rawKey] || rawKey;
    const normalized = normalizeSlotValue(canonicalKey, rawValue);
    if (!normalized) continue;
    out[canonicalKey] = normalized;
  }

  return out;
}

function scoreNameCompleteness(name) {
  const text = normalizeName(name);
  if (!text) return 0;

  let score = 0;
  const parts = text.split(/\s+/).filter(Boolean);

  score += parts.length * 10;
  score += text.length;

  if (parts.length >= 2) score += 30;
  if (/^[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)+$/.test(text)) score += 20;

  return score;
}

function shouldReplaceExistingSlot(slotKey, existingValue, incomingValue) {
  const existing = normalizeSlotValue(slotKey, existingValue);
  const incoming = normalizeSlotValue(slotKey, incomingValue);

  if (!incoming) return false;
  if (!existing) return true;
  if (existing === incoming) return false;

  const key = String(slotKey || "").toLowerCase();

  // Name overwrite rule: fuller name should replace shorter/partial name cleanly.
  if (key.includes("name")) {
    return scoreNameCompleteness(incoming) >= scoreNameCompleteness(existing);
  }

  // Generic rule: accept explicit update if incoming is longer / more specific.
  if (incoming.length >= existing.length) return true;

  return false;
}

function mergeSlots(currentSlots, extractedSlots, schema) {
  const existing = isObject(currentSlots) ? { ...currentSlots } : {};
  const incoming = canonicalizeExtractedSlots(extractedSlots, schema);

  for (const [slotKey, incomingValue] of Object.entries(incoming)) {
    const existingValue = existing[slotKey];

    if (shouldReplaceExistingSlot(slotKey, existingValue, incomingValue)) {
      existing[slotKey] = normalizeSlotValue(slotKey, incomingValue);
    }
  }

  return existing;
}

function getMissingSlots(slots, requiredSlots) {
  const source = isObject(slots) ? slots : {};
  const required = Array.isArray(requiredSlots) ? requiredSlots : [];

  return required.filter((slotKey) => !isNonEmptyString(source[slotKey]));
}

function deriveWorkflowStatus({ slots, requiredSlots, existingStatus }) {
  const missing = getMissingSlots(slots, requiredSlots);

  if (missing.length === 0) {
    return "ready_for_confirmation";
  }

  if (existingStatus === "completed") {
    return "completed";
  }

  return "collecting";
}

function buildConfirmationSummary(slots, requiredSlots) {
  const keys = Array.isArray(requiredSlots) ? requiredSlots : Object.keys(slots || {});
  const parts = [];

  for (const key of keys) {
    const value = safeString(slots?.[key]);
    if (!value) continue;

    const spokenKey = key
      .replace(/_/g, " ")
      .replace(/\bparty size\b/i, "party size")
      .replace(/\bcustomer name\b/i, "name");

    parts.push(`${spokenKey}: ${value}`);
  }

  return parts.join(", ");
}

function updateWorkflowState({
  workflow,
  schema,
  extractedSlots,
  callerText,
  now
} = {}) {
  const currentWorkflow = isObject(workflow) ? { ...workflow } : {};
  const currentSlots = isObject(currentWorkflow.slots) ? { ...currentWorkflow.slots } : {};

  const requiredSlots = getRequiredSlots(schema, currentWorkflow);
  const mergedSlots = mergeSlots(currentSlots, extractedSlots, schema);
  const missingSlots = getMissingSlots(mergedSlots, requiredSlots);
  const nextMissingSlot = missingSlots[0] || null;
  const workflowStatus = deriveWorkflowStatus({
    slots: mergedSlots,
    requiredSlots,
    existingStatus: currentWorkflow.workflowStatus || currentWorkflow.status
  });

  const updated = {
    ...currentWorkflow,
    slots: mergedSlots,
    requiredSlots,
    missingSlots,
    nextMissingSlot,
    workflowStatus,
    status: workflowStatus,
    confirmationSummary:
      workflowStatus === "ready_for_confirmation"
        ? buildConfirmationSummary(mergedSlots, requiredSlots)
        : "",
    lastCallerText: safeString(callerText),
    updatedAt: now || Date.now()
  };

  if (nextMissingSlot) {
    updated.currentPrompt = getPromptForSlot(nextMissingSlot, schema);
  } else {
    updated.currentPrompt = "";
  }

  return updated;
}

function createInitialWorkflowState({ schema, existingWorkflow } = {}) {
  const workflow = isObject(existingWorkflow) ? existingWorkflow : {};
  const requiredSlots = getRequiredSlots(schema, workflow);

  return updateWorkflowState({
    workflow: {
      ...workflow,
      slots: isObject(workflow.slots) ? workflow.slots : {},
      requiredSlots
    },
    schema,
    extractedSlots: {},
    callerText: ""
  });
}

function computeWorkflowState({ clusterSchema, session, extraction }) {
  const existingWorkflow = session?.workflow || {};

  const extractedSlots =
    extraction?.slots ||
    extraction?.extractedSlots ||
    {};

  const updated = updateWorkflowState({
    workflow: {
      ...existingWorkflow,
      slots: session?.slots || {},
      workflowStatus: session?.workflowStatus || "collecting"
    },
    schema: clusterSchema,
    extractedSlots,
    callerText: extraction?.utterance || ""
  });

  return {
    intent: extraction?.intent || session?.active_intent || null,
    slots: updated.slots || {},
    nextMissingSlot: updated.nextMissingSlot || null,
    workflowStatus: updated.workflowStatus || "collecting",
    confirmationSummary: updated.confirmationSummary || ""
  };
}
module.exports = {
  createInitialWorkflowState,
  updateWorkflowState,
  computeWorkflowState,   // ✅ CRITICAL FIX
  mergeSlots,
  getMissingSlots,
  buildConfirmationSummary,

  advanceWorkflowState: updateWorkflowState,
  resolveWorkflowState: updateWorkflowState
};