"use strict";

/**
 * src/voice/workflowReplyComposer.js
 *
 * Compatibility-safe for current sessionController.js contract.
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

  const questionCount = (value.match(/\?/g) || []).length;
  if (questionCount > 1) {
    const segments = value.split("?").map((s) => s.trim()).filter(Boolean);
    value = segments[0] ? `${segments[0]}?` : value;
  }

  if (value.length > 220) {
    value = `${value.slice(0, 217).trim()}...`;
  }

  return value;
}

function getSlotPrompt(slotKey, schema) {
  if (!slotKey) return "";
  const slotDef = Array.isArray(schema?.slots)
    ? schema.slots.find((s) => s?.key === slotKey)
    : null;

  return safeString(slotDef?.prompt || slotDef?.question || "");
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

  return "Could I get that detail one more time?";
}

function buildConfirmationReply(workflowState) {
  const slots = workflowState?.slots || {};
  const keys = Object.keys(slots);
  const values = {};

  for (const key of keys) {
    if (isNonEmptyString(slots[key])) {
      values[key] = slots[key];
    }
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

  if (parts.length) {
    return cleanPhoneReply(`Let me confirm: ${parts.join(" ")}. Is that correct?`);
  }

  if (safeString(workflowState?.confirmationSummary)) {
    return cleanPhoneReply(
      `Let me confirm: ${workflowState.confirmationSummary}. Is that correct?`
    );
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

/**
 * Compatibility-safe composeReply for current sessionController.js
 * sessionController sends:
 * composeReply({ clusterSchema, session, workflowState, utterance })
 */
async function composeReply({
  clusterSchema,
  session,
  workflowState,
  utterance
} = {}) {
  const schema = clusterSchema || {};
  const state = workflowState || {};
  const status = String(state.workflowStatus || "").toLowerCase();

  const extractedReply =
    state.reply ||
    state.replyText ||
    state.openAIReply ||
    "";

  const cleaned = cleanPhoneReply(extractedReply);

  if (status === "ready_for_confirmation") {
    return buildConfirmationReply(state);
  }

  if (!looksWeakReply(cleaned)) {
    return cleaned;
  }

   const nextMissingSlot = state.nextMissingSlot || null;
  if (nextMissingSlot) {
    return buildDeterministicQuestion(nextMissingSlot, schema);
  }

  const knownSlots = Object.keys(state.slots || {}).filter((k) => isNonEmptyString(state.slots[k]));
  if (knownSlots.length > 0) {
    return "Got it. What’s the next detail I should note down?";
  }

  return "Could you say that one more time?";

module.exports = {
  composeReply,
  buildConfirmationReply,
  cleanPhoneReply
};