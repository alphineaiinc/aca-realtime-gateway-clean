"use strict";

/**
 * src/voice/workflowReplyComposer.js
 *
 * Short, natural, phone-friendly workflow reply composition.
 *
 * Rules:
 * - No awkward phrasing
 * - One short question only
 * - No repetition
 * - If workflowStatus is ready_for_confirmation, always produce confirmation
 * - If OpenAI reply is empty / weak, deterministic fallback must still speak
 */

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeWhitespace(text) {
  return safeString(text).replace(/\s+/g, " ").trim();
}

function getSlotPrompt(slotKey, schema) {
  if (!slotKey) return "";
  const slotDef = Array.isArray(schema?.slots)
    ? schema.slots.find((s) => s?.key === slotKey)
    : null;

  return safeString(slotDef?.prompt || slotDef?.question || "");
}

function humanLabel(slotKey) {
  return String(slotKey || "")
    .replace(/_/g, " ")
    .replace(/\bparty size\b/i, "how many people")
    .replace(/\bcustomer name\b/i, "your full name")
    .trim()
    .toLowerCase();
}

function buildDeterministicQuestion(nextMissingSlot, schema) {
  const explicitPrompt = getSlotPrompt(nextMissingSlot, schema);
  if (explicitPrompt) return cleanPhoneReply(explicitPrompt);

  const key = String(nextMissingSlot || "").toLowerCase();

  if (key.includes("date") || key.includes("day")) {
    return "What date would you like?";
  }
  if (key.includes("time")) {
    return "What time works for you?";
  }
  if (
    key.includes("party") ||
    key.includes("size") ||
    key.includes("guest") ||
    key.includes("people") ||
    key.includes("person")
  ) {
    return "How many people should I put down?";
  }
  if (key.includes("name")) {
    return "Can I have your full name?";
  }
  if (key.includes("phone")) {
    return "What’s the best phone number for you?";
  }
  if (key.includes("email")) {
    return "What’s the best email address for you?";
  }

  return `Can I get ${humanLabel(nextMissingSlot)}?`;
}

function buildConfirmationReply({ workflow, schema }) {
  const slots = workflow?.slots || {};
  const requiredSlots = Array.isArray(workflow?.requiredSlots)
    ? workflow.requiredSlots
    : Object.keys(slots);

  const values = {};
  for (const key of requiredSlots) {
    if (isNonEmptyString(slots[key])) values[key] = slots[key];
  }

  const nameKey = Object.keys(values).find((k) => k.toLowerCase().includes("name"));
  const dateKey = Object.keys(values).find((k) => k.toLowerCase().includes("date") || k.toLowerCase().includes("day"));
  const timeKey = Object.keys(values).find((k) => k.toLowerCase().includes("time"));
  const sizeKey = Object.keys(values).find((k) =>
    /(party|size|guest|people|person)/i.test(k)
  );

  const parts = [];

  if (values[dateKey]) parts.push(values[dateKey]);
  if (values[timeKey]) parts.push(`at ${values[timeKey]}`);
  if (values[sizeKey]) parts.push(`for ${values[sizeKey]}`);
  if (values[nameKey]) parts.push(`under ${values[nameKey]}`);

  if (parts.length > 0) {
    return cleanPhoneReply(`Let me confirm: ${parts.join(" ")}. Is that correct?`);
  }

  // fallback if schema is generic and slot labels are unknown
  const genericSummary = safeString(workflow?.confirmationSummary);
  if (genericSummary) {
    return cleanPhoneReply(`Let me confirm: ${genericSummary}. Is that correct?`);
  }

  return "Let me confirm the details I have. Is that correct?";
}

function looksWeakReply(text) {
  const value = normalizeWhitespace(text).toLowerCase();
  if (!value) return true;
  if (value.length < 4) return true;

  const banned = [
    "can you tell date",
    "what time?",
    "what time",
    "sure, when you would like to book?",
    "please provide",
    "share the date",
    "share the time",
    "provide the date",
    "provide the time"
  ];

  return banned.some((phrase) => value === phrase || value.includes(phrase));
}

function cleanPhoneReply(text) {
  let value = normalizeWhitespace(text);

  if (!value) return "";

  value = value
    .replace(/\s+([,?.!])/g, "$1")
    .replace(/\bcan you tell date\b/gi, "What date would you like?")
    .replace(/\bwhat time\b\??/gi, "What time works for you?")
    .replace(/\bsure,\s*when you would like to book\??/gi, "What time would you like?")
    .replace(/\bkindly\b/gi, "")
    .replace(/\bplease provide\b/gi, "Can I get")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Keep only one short question at the end for phone flow.
  const questionCount = (value.match(/\?/g) || []).length;
  if (questionCount > 1) {
    const segments = value.split("?").map((s) => s.trim()).filter(Boolean);
    value = segments[0] ? `${segments[0]}?` : value;
  }

  // Keep voice response short.
  if (value.length > 220) {
    value = `${value.slice(0, 217).trim()}...`;
  }

  return value;
}

function chooseOpenAIReply({ openAIReply, workflow, schema }) {
  const candidate = cleanPhoneReply(openAIReply);
  if (looksWeakReply(candidate)) return "";
  if ((workflow?.workflowStatus || workflow?.status) === "ready_for_confirmation") {
    // Confirmation must be deterministic at this stage.
    return "";
  }
  return candidate;
}

function buildFallbackReply({ workflow, schema }) {
  const status = workflow?.workflowStatus || workflow?.status || "collecting";

  if (status === "ready_for_confirmation") {
    return buildConfirmationReply({ workflow, schema });
  }

  const nextMissingSlot = workflow?.nextMissingSlot || workflow?.missingSlots?.[0] || null;
  if (nextMissingSlot) {
    return buildDeterministicQuestion(nextMissingSlot, schema);
  }

  return "Could you say that one more time?";
}

function composeReply({
  workflow,
  schema,
  openAIReply
} = {}) {
  const preferred = chooseOpenAIReply({ openAIReply, workflow, schema });
  if (preferred) return preferred;

  const fallback = buildFallbackReply({ workflow, schema });
  return cleanPhoneReply(fallback);
}

module.exports = {
  composeReply,
  buildFallbackReply,
  buildConfirmationReply,
  cleanPhoneReply,

  // backward-friendly aliases
  composeWorkflowReply: composeReply
};