// src/voice/voiceSessionStore.js

const sessions = new Map();
const { isValidatedRoutingContext } = require("./tenantResolver");

function createSession(callSid, meta = {}) {
  const routing = meta.routingContext;
  if (!isValidatedRoutingContext(routing) || routing.callSid !== callSid || sessions.has(callSid)) {
    throw new Error("UNVERIFIED_ROUTING_CONTEXT");
  }
  const now = Date.now();

  const session = {
    callSid,
    tenantId: routing.tenantId,
    businessId: null,
    clusterId: routing.clusterId,
    routingContext: routing,

    state: "idle",
    greeted: false,

    turnIndex: 0,

    lastUserSpeechAt: null,
    lastAssistantSpeechAt: null,
    lastFallbackAt: null,

    partialTranscript: "",
    finalTranscriptBuffer: "",

    currentIntent: null,
    active_intent: null,
    workflow: null,
    workflowStatus: "idle",

    extractedSlots: {},
    slots: {},
    workflowSlots: {},

    lastAskedSlot: null,
    lastAssistantReply: null,
    lastCallerText: null,
    recentTurns: [],

    activeTaskId: null,

    isSpeaking: false,
    isProcessing: false,

    voiceGate: {
      assistantSpeaking: false,
      ignoreInputUntil: 0,
      pendingMarks: new Set(),
      lastPlaybackStartedAt: 0,
      lastPlaybackEndedAt: 0,
    },

    createdAt: now,
    updatedAt: now,
  };

  for (const key of ["tenantId", "businessId", "clusterId", "routingContext"]) {
    Object.defineProperty(session, key, { writable: false, configurable: false });
  }
  sessions.set(callSid, session);

  console.log(`🆕 [SESSION CREATED] ${callSid}`);

  return session;
}

function getSession(callSid) {
  return sessions.get(callSid);
}

function removeSession(callSid) {
  sessions.delete(callSid);
  console.log(`🧹 [SESSION REMOVED] ${callSid}`);
}

module.exports = {
  createSession,
  getSession,
  removeSession,
};