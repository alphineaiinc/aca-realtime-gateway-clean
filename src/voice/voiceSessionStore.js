// src/voice/voiceSessionStore.js

const sessions = new Map();

function createSession(callSid, meta = {}) {
  const session = {
    callSid,
    tenantId: meta.tenantId || null,
    businessId: meta.businessId || null,

    state: "idle",
    greeted: false,

    turnIndex: 0,

    lastUserSpeechAt: null,
    lastAssistantSpeechAt: null,
    lastFallbackAt: null,

    partialTranscript: "",
    finalTranscriptBuffer: "",

    currentIntent: null,
    extractedSlots: {},

    activeTaskId: null,

    isSpeaking: false,
    isProcessing: false,

    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

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