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

function buildConfirmationReplyFromSession(session) {
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

  const dateValue = findValue((key) => key.includes("date") || key.includes("day"));
  const timeValue = findValue((key) => key.includes("time"));
  const partyValue = findValue((key) =>
    key.includes("party") ||
    key.includes("size") ||
    key.includes("guest") ||
    key.includes("people") ||
    key.includes("person")
  );
  const nameValue = findValue((key) => key.includes("name"));

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
    return "Could you tell me that one more time?";
  }

  if (slot.includes("date") || slot.includes("day")) {
    return "What date would you like?";
  }

  if (slot.includes("time")) {
    return "What time works for you?";
  }

  if (
    slot.includes("party") ||
    slot.includes("size") ||
    slot.includes("guest") ||
    slot.includes("people") ||
    slot.includes("person")
  ) {
    return "How many people should I put down?";
  }

  if (slot.includes("name")) {
    return "Can I have your full name?";
  }

  if (slot.includes("phone")) {
    return "What’s the best phone number for you?";
  }

  if (slot.includes("email")) {
    return "What’s the best email address for you?";
  }

  return "Could you tell me that one more time?";
}

function buildSafeFallbackReply(session) {
  const workflowStatus = String(session?.workflowStatus || "").toLowerCase();

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

  if (session.recentTurns.length > 8) {
    session.recentTurns = session.recentTurns.slice(-8);
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

  let workflowState;
  try {
    workflowState = computeWorkflowState({
      clusterSchema,
      session,
      extraction,
    });
  } catch (err) {
    logError(callSid, "Workflow state computation failed", {
      error: err.message,
      extraction,
      clusterId: session.clusterId,
      tenantId: session.tenantId,
    });

    return {
      shouldSpeak: true,
      replyText: "Sorry — could you repeat that?",
      replyType: "repair",
    };
  }

  session.active_intent = workflowState.intent || null;
  session.workflow = workflowState.intent || null;
  session.slots = workflowState.slots || {};
  session.workflowSlots = workflowState.slots || {};
  session.lastAskedSlot = workflowState.nextMissingSlot || null;
  session.workflowStatus = workflowState.workflowStatus || "idle";

  let replyText;
  try {
    replyText = await composeReply({
      clusterSchema,
      session,
      workflowState,
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
    const alternateFallback = buildSafeFallbackReply(session);
    if (alternateFallback && alternateFallback !== replyText) {
      replyText = alternateFallback;
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