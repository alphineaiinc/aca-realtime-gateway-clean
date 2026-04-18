// src/voice/sessionController.js

const { createSession, getSession, removeSession } = require("./voiceSessionStore");
const { STATES, transition } = require("./stateMachine");
const { logEvent, logDecision, logError } = require("./voiceLogger");

const { resolveTenantFromVoiceContext } = require("./tenantResolver");
const { loadClusterSchema } = require("./clusterSchemaLoader");
const { extractWorkflowTurn } = require("./workflowExtractor");
const { computeWorkflowState } = require("./workflowStateEngine");
const { composeReply } = require("./workflowReplyComposer");

function handleCallStarted(callSid, meta = {}) {
  let session = getSession(callSid);

  if (!session) {
    session = createSession(callSid, meta);
  }

  if (!session.workflow) {
    session.workflow = null;
  }

  if (!session.workflowSlots) {
    session.workflowSlots = {};
  }

  if (!session.slots) {
    session.slots = {};
  }

  if (!session.active_intent) {
    session.active_intent = null;
  }

  if (!session.workflowStatus) {
    session.workflowStatus = "idle";
  }

  if (!session.clusterId) {
    session.clusterId = null;
  }

  if (!session.tenantId) {
    session.tenantId = null;
  }

  if (!session.businessId) {
    session.businessId = null;
  }

  if (!session.lastAskedSlot) {
    session.lastAskedSlot = null;
  }

  if (!session.lastAssistantReply) {
    session.lastAssistantReply = null;
  }

  if (!session.lastCallerText) {
    session.lastCallerText = null;
  }

  if (!session.recentTurns) {
    session.recentTurns = [];
  }

  transition(session, STATES.GREETING, "call_started");

  logEvent(callSid, "CALL_STARTED", meta);

  return session;
}

function handleGreeting(callSid) {
  const session = getSession(callSid);
  if (!session) return null;

  if (session.greeted) {
    logDecision(callSid, "Greeting skipped (already greeted)");
    return null;
  }

  session.greeted = true;

  transition(session, STATES.LISTENING, "greeting_sent");

  const reply = {
    shouldSpeak: true,
    replyText: "Hello, thanks for calling. How can I help you today?",
    replyType: "greeting",
  };

  logDecision(callSid, "Sending greeting");

  return reply;
}

function handleTranscriptPartial(callSid, text) {
  const session = getSession(callSid);
  if (!session) return;

  session.partialTranscript = text;
  session.lastUserSpeechAt = Date.now();

  if (
    session.state === STATES.LISTENING ||
    session.state === STATES.AWAITING_INPUT
  ) {
    transition(session, STATES.AWAITING_END_OF_TURN, "user_started_speaking");
  }

  logEvent(callSid, "TRANSCRIPT_PARTIAL", { text });
}

function handleTranscriptFinal(callSid, text) {
  const session = getSession(callSid);
  if (!session) return null;

  session.finalTranscriptBuffer = text;
  session.lastUserSpeechAt = Date.now();

  logEvent(callSid, "TRANSCRIPT_FINAL", { text });

  if (!text || text.trim().length < 3) {
    logDecision(callSid, "Ignoring short/invalid transcript");
    return null;
  }

  transition(session, STATES.PROCESSING, "final_transcript_received");

  session.isProcessing = true;

  return {
    shouldProcess: true,
    text,
  };
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsableReply(text) {
  return normalizeText(text).length > 0;
}

function normalizeSlotName(slotName) {
  return String(slotName || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim();
}

function titleCase(text) {
  return normalizeText(text)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildConversationTranscript(session) {
  return (session?.recentTurns || [])
    .map((turn) => `${turn.role}: ${normalizeText(turn.text)}`)
    .filter(Boolean)
    .join("\n");
}

function extractDateValue(text) {
  const value = normalizeText(text).toLowerCase();
  if (!value) return "";

  const directDay = value.match(
    /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
  );
  if (directDay) {
    return directDay[1];
  }

  const monthDay = value.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
  );
  if (monthDay) {
    return `${monthDay[1]} ${monthDay[2]}`;
  }

  const dayMonth = value.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  );
  if (dayMonth) {
    return `${dayMonth[2]} ${dayMonth[1]}`;
  }

  const numericDate = value.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/);
  if (numericDate) {
    return numericDate[0];
  }

  return "";
}

function extractTimeValue(text) {
  const value = normalizeText(text).toLowerCase();
  if (!value) return "";

  // Full explicit time
  const explicit = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (explicit) {
    const hour = explicit[1];
    const mins = explicit[2] || "00";
    const period = explicit[3].toUpperCase();
    return `${hour}:${mins} ${period}`;
  }

  // "7 in the evening"
  const evening = value.match(/\b(\d{1,2})\s*(?:in the)?\s*(evening|night)\b/i);
  if (evening) {
    let hour = Number(evening[1]);
    if (hour < 12) hour += 12;
    return `${hour}:00`;
  }

  // "7 in the morning"
  const morning = value.match(/\b(\d{1,2})\s*(?:in the)?\s*(morning)\b/i);
  if (morning) {
    return `${morning[1]}:00 AM`;
  }

  // "7 pm" spoken as "7"
  const simple = value.match(/\b(\d{1,2})\b/);
  const hasPm = /\b(pm|evening|night)\b/.test(value);
  const hasAm = /\b(am|morning)\b/.test(value);

  if (simple) {
    let hour = Number(simple[1]);

    if (hasPm && hour < 12) hour += 12;

    if (hasPm) return `${hour}:00`;
    if (hasAm) return `${hour}:00 AM`;

    return `${hour}:00`;
  }

  return "";
}

function extractNameValue(text) {
  const value = normalizeText(text);
  if (!value) return "";

  const prefixed = value.match(
    /\b(?:my name is|this is|i am)\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2})\b/i
  );
  if (prefixed) {
    return titleCase(prefixed[1]);
  }

  if (/^[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2}$/.test(value)) {
    return titleCase(value);
  }

  return "";
}

function extractCountValue(text) {
  const value = normalizeText(text);
  if (!value) return "";

  const numeric = value.match(/\b\d{1,2}\b/);
  return numeric ? numeric[0] : "";
}

function extractPhoneValue(text) {
  const value = normalizeText(text);
  if (!value) return "";

  const phone = value.match(/(?:\+?\d[\d\s()-]{6,}\d)/);
  return phone ? normalizeText(phone[0]) : "";
}

function extractEmailValue(text) {
  const value = normalizeText(text);
  if (!value) return "";

  const email = value.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return email ? email[0] : "";
}

function extractTypeValue(text) {
  const value = normalizeText(text);
  if (!value) return "";

  const cleaned = value
    .replace(/^(it'?s|it is|for|a|an)\s+/i, "")
    .replace(/\bappointment\b/gi, "appointment")
    .trim();

  if (!cleaned) return "";

  if (/^(general|general visit|consultation|checkup|follow up|follow-up|repair|table|reservation|meeting|haircut|visit)$/i.test(cleaned)) {
    return cleaned;
  }

  if (cleaned.split(/\s+/).length <= 4) {
    return cleaned;
  }

  return "";
}

function inferSlotValueFromUtterance(slotName, utterance) {
  const normalizedSlot = normalizeSlotName(slotName);
  const text = normalizeText(utterance);

  if (!normalizedSlot || !text) return "";

  if (normalizedSlot.includes("date") || normalizedSlot.includes("day")) {
    return extractDateValue(text);
  }

  if (normalizedSlot.includes("time")) {
    return extractTimeValue(text);
  }

  if (normalizedSlot.includes("name")) {
    return extractNameValue(text);
  }

  if (
    normalizedSlot.includes("party") ||
    normalizedSlot.includes("size") ||
    normalizedSlot.includes("guest") ||
    normalizedSlot.includes("people") ||
    normalizedSlot.includes("person")
  ) {
    return extractCountValue(text);
  }

  if (normalizedSlot.includes("phone")) {
    return extractPhoneValue(text);
  }

  if (normalizedSlot.includes("email")) {
    return extractEmailValue(text);
  }

  if (
    normalizedSlot.includes("type") ||
    normalizedSlot.includes("reason") ||
    normalizedSlot.includes("purpose") ||
    normalizedSlot.includes("service")
  ) {
    return extractTypeValue(text);
  }

  return "";
}

function inferHeuristicSlotsFromUtterance(session, utterance) {
  const inferred = {};
  const text = normalizeText(utterance);
  if (!text) return inferred;

  const expectedSlot = normalizeSlotName(session?.lastAskedSlot || "");

  const expectedValue = inferSlotValueFromUtterance(expectedSlot, text);
  if (expectedSlot && expectedValue) {
    inferred[session.lastAskedSlot] = expectedValue;
  }

  const dateValue = extractDateValue(text);
  if (dateValue) {
    inferred.date = inferred.date || dateValue;
  }

  const timeValue = extractTimeValue(text);
  if (timeValue) {
    inferred.time = inferred.time || timeValue;
  }

  const nameValue = extractNameValue(text);
  if (nameValue) {
    inferred.name = inferred.name || nameValue;
  }

  const typeValue = extractTypeValue(text);
  if (typeValue) {
    inferred.type = inferred.type || typeValue;
  }

  return inferred;
}

function inferHolisticSlotsFromConversation(session) {
  const transcript = buildConversationTranscript(session);
  const inferred = {};

  if (!transcript) return inferred;

  const dateValue = extractDateValue(transcript);
  if (dateValue) inferred.date = dateValue;

  const timeValue = extractTimeValue(transcript);
  if (timeValue) inferred.time = timeValue;

  const nameValue = extractNameValue(transcript);
  if (nameValue) inferred.name = nameValue;

  const typeValue = extractTypeValue(transcript);
  if (typeValue) inferred.type = typeValue;

  const phoneValue = extractPhoneValue(transcript);
  if (phoneValue) inferred.phone = phoneValue;

  const emailValue = extractEmailValue(transcript);
  if (emailValue) inferred.email = emailValue;

  const expectedSlot = normalizeSlotName(session?.lastAskedSlot || "");
  if (expectedSlot) {
    const expectedValue = inferSlotValueFromUtterance(expectedSlot, transcript);
    if (expectedValue && session.lastAskedSlot) {
      inferred[session.lastAskedSlot] = expectedValue;
    }
  }

  return inferred;
}

function mergeSlotsWithoutEmpty(existingSlots = {}, incomingSlots = {}) {
  const merged = { ...existingSlots };

  for (const [key, value] of Object.entries(incomingSlots || {})) {
    if (value === null || value === undefined) continue;
    const normalized = normalizeText(value);
    if (!normalized) continue;
    merged[key] = normalized;
  }

  return merged;
}

function getSlotValueByAlias(slots = {}, aliases = []) {
  const entries = Object.entries(slots || {});

  for (const [key, value] of entries) {
    const normalizedKey = normalizeSlotName(key);
    const normalizedValue = normalizeText(value);

    if (!normalizedValue) continue;

    if (aliases.some((alias) => normalizedKey.includes(alias))) {
      return normalizedValue;
    }
  }

  return "";
}

function getCanonicalRequiredSlotStatus(slots = {}) {
  return {
    type: getSlotValueByAlias(slots, [
      "type",
      "reason",
      "purpose",
      "service",
      "appointment type",
      "appointment_type",
    ]),
    date: getSlotValueByAlias(slots, [
      "date",
      "day",
      "appointment date",
      "appointment_date",
    ]),
    time: getSlotValueByAlias(slots, [
      "time",
      "appointment time",
      "appointment_time",
    ]),
    name: getSlotValueByAlias(slots, [
      "name",
      "customer name",
      "full name",
      "client name",
      "customer_name",
      "full_name",
    ]),
    phone: getSlotValueByAlias(slots, [
  "phone number",
  "contact number",
  "mobile number",
  "telephone number",
  "phone_number",
  "contact_number",
  "mobile_number",
  "telephone_number",
  "phone",
  "mobile",
  "telephone",
  "number",
]),
  };
}

function getFirstMissingCanonicalRequiredSlot(slots = {}) {
  const status = getCanonicalRequiredSlotStatus(slots);

  if (!status.type) return "type";
  if (!status.date) return "date";
  if (!status.time) return "time";
  if (!status.name) return "name";
  if (!status.phone) return "phone";

  return null;
}

function buildConfirmationReplyFromSession(session) {
   const missingRequired = getFirstMissingCanonicalRequiredSlot(session?.slots || {});

if (missingRequired) {
  return buildSlotQuestion(missingRequired);
}
  const slots = session?.slots || {};
  const values = Object.entries(slots)
    .filter(([, value]) => normalizeText(value))
    .map(([key, value]) => ({ key, value: normalizeText(value) }));

  if (!values.length) {
    return "Let me confirm the details I have. Is that correct?";
  }

  const findValue = (matcher) => {
    const hit = values.find(({ key }) => matcher(String(key).toLowerCase()));
    return hit ? hit.value : "";
  };

  const canonicalStatus = getCanonicalRequiredSlotStatus(slots);

const dateValue = canonicalStatus.date;
const timeValue = canonicalStatus.time;
const nameValue = canonicalStatus.name;

const partyValue = findValue((key) =>
  key.includes("party") ||
  key.includes("size") ||
  key.includes("guest") ||
  key.includes("people") ||
  key.includes("person")
);

  const parts = [];
  if (dateValue) parts.push(dateValue);
  if (timeValue) parts.push(`at ${timeValue}`);
  if (partyValue) parts.push(`for ${partyValue}`);
  if (nameValue) parts.push(`under ${nameValue}`);

  if (parts.length > 0) {
    return `Let me confirm: ${parts.join(" ")}. Is that correct?`;
  }

  return "Let me confirm the details I have. Is that correct?";
}

function buildSlotQuestion(slotName) {
  const slot = String(slotName || "").toLowerCase();

  if (!slot) {
    return "Sorry, I missed that — could you say that again?";
  }

  if (slot.includes("date") || slot.includes("day")) {
    return "Sorry, I missed the date there — which date should I book it for?";
  }

  if (slot.includes("time")) {
    return "Sorry, I didn’t catch the time — what time works for you?";
  }

  if (
    slot.includes("party") ||
    slot.includes("size") ||
    slot.includes("guest") ||
    slot.includes("people") ||
    slot.includes("person")
  ) {
    return "How many people should I reserve for?";
  }

  if (slot.includes("name")) {
   return "Sorry about that — may I have your name for the booking?";
  }

  if (slot.includes("phone")) {
   return "Sorry, I missed the number — what’s the best number to reach you?";
  }

  if (slot.includes("email")) {
    return "What’s your email address?";
  }

  if (
    slot.includes("type") ||
    slot.includes("reason") ||
    slot.includes("purpose") ||
    slot.includes("service")
  ) {
    return "Sorry, I didn’t catch the appointment type — what type do you need?";
  }

 return "Sorry, I missed that — could you say it again?";
}

function buildSafeFallbackReply(session) {
  const workflowStatus = String(session?.workflowStatus || "").toLowerCase();

 const missingRequired = getFirstMissingCanonicalRequiredSlot(session?.slots || {});

if (missingRequired) {
  return buildSlotQuestion(missingRequired);
}

if (workflowStatus === "ready_for_confirmation" || workflowStatus === "completed") {
  return buildConfirmationReplyFromSession(session);
}

  if (session?.lastAskedSlot) {
    return buildSlotQuestion(session.lastAskedSlot);
  }

  const slots = session?.slots || {};
  const knownSlotCount = Object.keys(slots).filter((key) => normalizeText(slots[key])).length;

  if (knownSlotCount > 0) {
    return "Got it. What’s the next detail I should note down?";
  }

  return "Sorry — could you say that again?";
}

function pushRecentTurn(session, role, text) {
  if (!session.recentTurns) {
    session.recentTurns = [];
  }

  session.recentTurns.push({
    role,
    text,
    at: Date.now(),
  });

  if (session.recentTurns.length > 12) {
    session.recentTurns = session.recentTurns.slice(-12);
  }
}

function handleProcessingResult(callSid, brainResult) {
  const session = getSession(callSid);
  if (!session) return null;

  session.isProcessing = false;

  if (!brainResult || !brainResult.shouldSpeak) {
    transition(session, STATES.LISTENING, "no_reply_needed");
    return null;
  }

  let replyText = normalizeText(brainResult.replyText);

  if (!isUsableReply(replyText)) {
    replyText = buildSafeFallbackReply(session);

    logDecision(callSid, "Empty processing reply replaced with fallback", {
      workflowStatus: session.workflowStatus,
      lastAskedSlot: session.lastAskedSlot,
      slots: session.slots || {},
      fallbackReplyText: replyText,
    });
  }

  transition(session, STATES.READY_TO_SPEAK, "brain_ready");

  return {
    shouldSpeak: true,
    replyText,
    replyType: brainResult.replyType || "reply",
  };
}

function handleSpeak(callSid) {
  const session = getSession(callSid);
  if (!session) return;

  session.isSpeaking = true;

  transition(session, STATES.SPEAKING, "tts_start");
}

function handleSpeechComplete(callSid) {
  const session = getSession(callSid);
  if (!session) return;

  session.isSpeaking = false;

  transition(session, STATES.AWAITING_INPUT, "tts_complete");
}

function handleCallEnded(callSid) {
  const session = getSession(callSid);
  if (!session) return;

  transition(session, STATES.ENDED, "call_ended");

  removeSession(callSid);

  logEvent(callSid, "CALL_ENDED");
}

async function handleCallerTurn({ callSid, businessId = null, transcript, meta = {} }) {
  const session = getSession(callSid);

  if (!session) {
    logError(callSid, "handleCallerTurn called without session");
    return {
      shouldSpeak: true,
      replyText: "Sorry — could you say that again?",
      replyType: "repair",
    };
  }

  const utterance = normalizeText(transcript);
  session.lastCallerText = utterance;

  if (!utterance) {
    logDecision(callSid, "Empty caller turn ignored");
    return {
      shouldSpeak: false,
      replyText: "",
      replyType: "noop",
    };
  }

  pushRecentTurn(session, "caller", utterance);

  let routing;
  try {
    routing = await resolveTenantFromVoiceContext({
      callSid,
      businessId,
      ...meta,
    });
  } catch (err) {
    logError(callSid, "Tenant resolution crashed", {
      error: err.message,
      businessId,
      meta,
    });

    return {
      shouldSpeak: true,
      replyText: "Sorry — something went wrong. Please try again.",
      replyType: "error",
    };
  }

  if (!routing || !routing.ok || !routing.tenantId || !routing.clusterId) {
    logError(callSid, "Tenant resolution failed", routing || { businessId, meta });

    return {
      shouldSpeak: true,
      replyText: "Sorry — something went wrong. Please try again.",
      replyType: "error",
    };
  }

  session.tenantId = routing.tenantId || null;
  session.businessId = routing.businessId || businessId || null;
  session.clusterId = routing.clusterId || null;

  let clusterSchema;
  try {
    clusterSchema = await loadClusterSchema(session.clusterId);
  } catch (err) {
    logError(callSid, "Cluster schema load failed", {
      error: err.message,
      clusterId: session.clusterId,
      tenantId: session.tenantId,
    });

    return {
      shouldSpeak: true,
      replyText: "Sorry — something went wrong. Please try again.",
      replyType: "error",
    };
  }

  let extraction;
  try {
    extraction = await extractWorkflowTurn({
      clusterId: session.clusterId,
      clusterSchema,
      session,
      utterance,
      recentTurns: session.recentTurns || [],
    });
  } catch (err) {
    logError(callSid, "Workflow extraction failed", {
      error: err.message,
      clusterId: session.clusterId,
      tenantId: session.tenantId,
      utterance,
    });

    return {
      shouldSpeak: true,
      replyText: "Sorry — could you repeat that?",
      replyType: "repair",
    };
  }

  const deterministicSlots = inferHeuristicSlotsFromUtterance(session, utterance);
  const holisticSlots = inferHolisticSlotsFromConversation(session);
  const extractionSlots = extraction?.slots || {};

  const combinedExtractionSlots = mergeSlotsWithoutEmpty(
    mergeSlotsWithoutEmpty(extractionSlots, deterministicSlots),
    holisticSlots
  );

  const effectiveExtraction = {
    ...(extraction || {}),
    slots: combinedExtractionSlots,
  };

  let workflowState;
  try {
    workflowState = computeWorkflowState({
      clusterSchema,
      session,
      extraction: effectiveExtraction,
    });
  } catch (err) {
    logError(callSid, "Workflow state computation failed", {
      error: err.message,
      extraction: effectiveExtraction,
      clusterId: session.clusterId,
      tenantId: session.tenantId,
    });

    return {
      shouldSpeak: true,
      replyText: "Sorry — could you repeat that?",
      replyType: "repair",
    };
  }

  session.active_intent = workflowState.intent || session.active_intent || null;
  session.workflow = workflowState.intent || session.workflow || null;

  const newSlots = mergeSlotsWithoutEmpty(
    mergeSlotsWithoutEmpty(workflowState.slots || {}, deterministicSlots),
    holisticSlots
  );

  session.slots = mergeSlotsWithoutEmpty(session.slots, newSlots);
  session.workflowSlots = mergeSlotsWithoutEmpty(session.workflowSlots || {}, newSlots);

  // 🔥 Detect if we just filled the expected slot
const expectedSlot = session.lastAskedSlot;
const justFilledValue = expectedSlot ? session.slots[expectedSlot] : null;

if (expectedSlot && justFilledValue) {
  logDecision(callSid, "Slot captured", {
    slot: expectedSlot,
    value: justFilledValue,
  });
}

if (workflowState.nextMissingSlot) {
  session.lastAskedSlot = workflowState.nextMissingSlot;
}
  session.workflowStatus = workflowState.workflowStatus || "idle";

  let replyText;
  try {
    replyText = await composeReply({
      clusterSchema,
      session,
      workflowState: {
        ...workflowState,
        slots: session.slots,
      },
      utterance,
    });
  } catch (err) {
    logError(callSid, "Workflow reply composition failed", {
      error: err.message,
      clusterId: session.clusterId,
      tenantId: session.tenantId,
      intent: workflowState.intent || null,
    });

    replyText = "";
  }

  replyText = normalizeText(replyText);

  if (replyText.length > 120) {
    replyText = replyText.slice(0, 120);
  }

  if (!isUsableReply(replyText)) {
    replyText = buildSafeFallbackReply(session);

    logDecision(callSid, "Workflow reply replaced with fallback", {
      tenantId: session.tenantId,
      businessId: session.businessId,
      clusterId: session.clusterId,
      intent: session.active_intent,
      workflowStatus: session.workflowStatus,
      slots: session.slots,
      nextMissingSlot: session.lastAskedSlot,
      fallbackReplyText: replyText,
    });
  }

  if (replyText === normalizeText(session.lastAssistantReply)) {
  if (workflowState.nextMissingSlot) {
    replyText = buildSlotQuestion(workflowState.nextMissingSlot);
  } else if (workflowState.confirmationPending) {
    replyText = "Let me confirm that once.";
  } else {
    replyText = "Sorry, could you repeat that?";
  }
}

  session.lastAssistantReply = replyText;

  if (isUsableReply(replyText)) {
    pushRecentTurn(session, "assistant", replyText);
  }

  logDecision(callSid, "AI workflow turn processed", {
    tenantId: session.tenantId,
    businessId: session.businessId,
    clusterId: session.clusterId,
    intent: session.active_intent,
    workflowStatus: session.workflowStatus,
    slots: session.slots,
    nextMissingSlot: session.lastAskedSlot,
    deterministicSlots,
    holisticSlots,
    conversationTranscript: buildConversationTranscript(session),
  });

  return {
    shouldSpeak: true,
    replyText,
    replyType: "ai",
    workflow: session.workflow,
    intent: session.active_intent,
    slots: session.slots,
    lastAskedSlot: session.lastAskedSlot,
    workflowStatus: session.workflowStatus,
    tenantId: session.tenantId,
    clusterId: session.clusterId,
  };
}

module.exports = {
  handleCallStarted,
  handleGreeting,
  handleTranscriptPartial,
  handleTranscriptFinal,
  handleProcessingResult,
  handleSpeak,
  handleSpeechComplete,
  handleCallEnded,
  handleCallerTurn,
};