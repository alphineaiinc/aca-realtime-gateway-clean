// src/voice/voiceLogger.js

function logEvent(callSid, type, payload = {}) {
  console.log(`📡 [VOICE EVENT] ${callSid} | ${type}`, payload);
}

function logDecision(callSid, message, meta = {}) {
  console.log(`🧠 [VOICE DECISION] ${callSid} | ${message}`, meta);
}

function logError(callSid, error) {
  console.error(`❌ [VOICE ERROR] ${callSid}`, error);
}

module.exports = {
  logEvent,
  logDecision,
  logError,
};