// src/voice/sessionController.js

const { createSession, getSession, removeSession } = require("./voiceSessionStore");
const { STATES, transition } = require("./stateMachine");
const { logEvent, logDecision, logError } = require("./voiceLogger");

function handleCallStarted(callSid, meta = {}) {
  let session = getSession(callSid);

  if (!session) {
    session = createSession(callSid, meta);
  }

  // ✅ Initialize minimal workflow memory safely
  if (!session.workflow) {
    session.workflow = null;
  }

  if (!session.workflowSlots) {
    session.workflowSlots = {};
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

function handleProcessingResult(callSid, brainResult) {
  const session = getSession(callSid);
  if (!session) return null;

  session.isProcessing = false;

  if (!brainResult || !brainResult.shouldSpeak) {
    transition(session, STATES.LISTENING, "no_reply_needed");
    return null;
  }

  transition(session, STATES.READY_TO_SPEAK, "brain_ready");

  return {
    shouldSpeak: true,
    replyText: brainResult.replyText,
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

/* -------------------------------------------------------------------------- */
/*                         Minimal workflow turn brain                         */
/* -------------------------------------------------------------------------- */

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function detectWorkflow(text, session) {
  const value = normalizeText(text).toLowerCase();

  if (session && session.workflow) {
    return session.workflow;
  }

  if (
    value.includes("book a table") ||
    value.includes("table for") ||
    value.includes("reservation") ||
    value.includes("reserve a table")
  ) {
    return "restaurant_reservation";
  }

  return "generic";
}

function parsePartySize(text) {
  const value = normalizeText(text).toLowerCase();

  const digitMatch = value.match(/\b(\d{1,2})\b/);
  if (digitMatch) {
    const num = Number(digitMatch[1]);
    if (num >= 1 && num <= 30) {
      return { party_size: num };
    }
  }

  const wordMap = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  for (const [word, num] of Object.entries(wordMap)) {
    if (value.includes(word)) {
      return { party_size: num };
    }
  }

  return {};
}

function parseName(text) {
  const value = normalizeText(text);

  let m = value.match(/\bmy name is ([a-z][a-z' -]{1,40})$/i);
  if (m) {
    return { customer_name: toTitleCase(m[1].trim()) };
  }

  m = value.match(/\bit'?s ([a-z][a-z' -]{1,40})$/i);
  if (m) {
    return { customer_name: toTitleCase(m[1].trim()) };
  }

  if (/^[a-z][a-z' -]{1,40}$/i.test(value) && value.split(" ").length <= 3) {
    return { customer_name: toTitleCase(value) };
  }

  return {};
}

function parseDateTime(text, lastAskedSlot) {
  const value = normalizeText(text).toLowerCase();
  const result = {};

  if (value.includes("tomorrow")) {
    result.reservation_date = "tomorrow";
  } else if (value.includes("today")) {
    result.reservation_date = "today";
  }

  const timeMatch =
    value.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ||
    value.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))\b/i);

  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = timeMatch[2] ? timeMatch[2] : "00";
    const ampm = timeMatch[3] ? timeMatch[3].toUpperCase() : null;

    if (hour >= 1 && hour <= 12) {
      result.reservation_time = ampm ? `${hour}:${minute} ${ampm}` : `${hour}:${minute}`;
    }
  } else if (lastAskedSlot === "reservation_time") {
    const shortTime = value.match(/^\s*(?:at\s*)?(\d{1,2})\s*(am|pm)?\s*$/i);
    if (shortTime) {
      const hour = Number(shortTime[1]);
      const ampm = shortTime[2] ? shortTime[2].toUpperCase() : "PM";

      if (hour >= 1 && hour <= 12) {
        result.reservation_time = `${hour}:00 ${ampm}`;
      }
    }
  }

  return result;
}

function mergeSlotsForRestaurantReservation(session, text) {
  const nextSlots = {
    ...(session.workflowSlots || {}),
  };

  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase();
  const lastAskedSlot = session.lastAskedSlot || null;

  const dateTime = parseDateTime(normalized, lastAskedSlot);
  Object.assign(nextSlots, dateTime);

  if (
    lastAskedSlot === "party_size" ||
    /\b(for|party of|table for)\b/i.test(lower) ||
    /\bpeople\b/i.test(lower) ||
    /^\d{1,2}$/.test(lower)
  ) {
    Object.assign(nextSlots, parsePartySize(normalized));
  }

  if (
    lastAskedSlot === "customer_name" ||
    /\bmy name is\b/i.test(lower) ||
    /\bit'?s\b/i.test(lower)
  ) {
    Object.assign(nextSlots, parseName(normalized));
  }

  return nextSlots;
}

function getNextMissingSlot(workflow, slots) {
  if (workflow === "restaurant_reservation") {
    if (!slots.reservation_date) return "reservation_date";
    if (!slots.reservation_time) return "reservation_time";
    if (!slots.party_size) return "party_size";
    if (!slots.customer_name) return "customer_name";
    return null;
  }

  return null;
}

function buildRestaurantReply(slots, nextMissingSlot) {
  if (nextMissingSlot === "reservation_date") {
    return "Of course — what day should I note for the table?";
  }

  if (nextMissingSlot === "reservation_time") {
    return "Sure — what time would you like me to note?";
  }

  if (nextMissingSlot === "party_size") {
    return "Of course — how many people should I note?";
  }

  if (nextMissingSlot === "customer_name") {
    return "Perfect — can I get the name for the reservation?";
  }

  return `Perfect — I have your table request for ${slots.party_size} on ${slots.reservation_date} at ${slots.reservation_time} under ${slots.customer_name}.`;
}

async function handleCallerTurn({ callSid, businessId = null, transcript }) {
  const session = getSession(callSid);
  if (!session) {
    logError(callSid, "handleCallerTurn called without session");
    return {
      replyText: "Sorry — could you say that again?",
      replyType: "repair",
      shouldSpeak: true,
    };
  }

  const safeText = normalizeText(transcript);
  session.lastCallerText = safeText;

  const workflow = detectWorkflow(safeText, session);
  session.workflow = workflow;

  if (!session.workflowSlots) {
    session.workflowSlots = {};
  }

  let replyText = "";

  if (workflow === "restaurant_reservation") {
    session.workflowSlots = mergeSlotsForRestaurantReservation(session, safeText);

    const nextMissingSlot = getNextMissingSlot(workflow, session.workflowSlots);
    session.lastAskedSlot = nextMissingSlot;

    replyText = buildRestaurantReply(session.workflowSlots, nextMissingSlot);

    logDecision(callSid, "Restaurant reservation turn processed", {
      workflow,
      slots: session.workflowSlots,
      nextMissingSlot,
      businessId,
    });
  } else {
    session.lastAskedSlot = null;
    replyText = "Of course — how can I help you today?";
    logDecision(callSid, "Generic workflow used", {
      workflow,
      businessId,
    });
  }

  session.lastAssistantReply = replyText;

  return {
    shouldSpeak: true,
    replyText,
    replyType: "reply",
    workflow: session.workflow,
    slots: session.workflowSlots,
    lastAskedSlot: session.lastAskedSlot,
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