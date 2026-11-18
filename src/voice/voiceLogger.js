"use strict";

// Content-free diagnostics. Never serialize caller-controlled strings or objects.
const numeric = new Set(["bytes", "chars", "elapsedMs", "holdMs", "mediaPacketCount", "payloadBytes", "base64Chars", "rms", "peak", "speechMs", "wordCount", "slotCount", "requiredSlotCount", "missingSlotCount", "statusCode"]);
const booleans = new Set(["hasAudio", "hasReply", "completed", "isProcessing", "isSpeaking", "accepted"]);
const enums = {
  state: new Set(["idle", "greeting", "listening", "awaiting_end_of_turn", "processing", "ready_to_speak", "speaking", "awaiting_input", "task_in_progress", "ready_for_confirmation", "completed", "ended", "failed"]),
  workflowStatus: new Set(["idle", "collecting", "ready_for_confirmation", "completed", "handoff_required"]),
  branch: new Set(["main", "ack", "greeting"]),
  status: new Set(["queued", "initiated", "ringing", "in-progress", "completed", "busy", "failed", "no-answer", "canceled"]),
  streamEvent: new Set(["stream-started", "stream-stopped", "stream-error"]),
};
enums.previousState = enums.state;
const diagnosticEvents = new Map([
  ["TTS_PROVIDER_FAILURE", "TTS_PROVIDER_FAILURE"],
  ["❌ [stt] Streaming STT error:", "STT_PROVIDER_FAILURE"],
  ["❌ searchKB error (DB or embeddings):", "RETRIEVAL_FAILURE"],
  ["[voice][dispatch_enter]", "VOICE_DISPATCH"],
  ["[stt][interim]", "STT_INTERIM"], ["[stt][final]", "STT_FINAL"],
  ["[stt][speech_start]", "STT_SPEECH_START"], ["[stt][speech_end]", "STT_SPEECH_END"],
  ["❌ [stt-stream] failed", "STT_FAILURE"], ["❌ Stream event rejected", "STREAM_REJECTED"],
  ["[voice][handleCallerTurn_result]", "VOICE_TURN_RESULT"],
  ["📥 [twilio] synthesizeSpeech returned", "TTS_RESULT"],
  ["🗣️ [twilio] about to call synthesizeSpeech", "TTS_REQUEST"],
  ["🎯 [tts] synthesizeSpeech ENTER", "TTS_REQUEST"],
  ["✅ [tts:openai] audio received", "TTS_AUDIO_RECEIVED"],
  ["✅ [tts:elevenlabs] synthesis complete", "TTS_AUDIO_RECEIVED"],
  ["STATE_TRANSITION", "STATE_TRANSITION"], ["STATE_REJECTED", "STATE_REJECTED"],
  ["SESSION_CREATED", "SESSION_CREATED"], ["SESSION_REMOVED", "SESSION_REMOVED"],
]);
const decisions = new Map([
  ["AI workflow turn processed", "WORKFLOW_PROCESSED"], ["Workflow ready for confirmation", "WORKFLOW_READY"],
  ["Required slot resolution", "WORKFLOW_REQUIRED_SLOTS"], ["Workflow extraction failed", "WORKFLOW_EXTRACTION_FAILED"],
  ["Workflow state computation failed", "WORKFLOW_STATE_FAILED"], ["Sending greeting", "GREETING_PREPARED"],
]);
const events = new Set(["CALL_STARTED", "CALL_ENDED", "TRANSCRIPT_PARTIAL", "TRANSCRIPT_FINAL", "STATUS_CALLBACK", "STREAM_STATUS_CALLBACK"]);
const codes = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ROUTING_UNAVAILABLE", "PROVIDER_ERROR"]);
function own(object, key) {
  if (!object || typeof object !== "object") return undefined;
  try { return Object.getOwnPropertyDescriptor(object, key)?.value; } catch { return undefined; }
}
function sanitizeMetadata(metadata) {
  const safe = {};
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return safe;
  for (const key of numeric) {
    const value = own(metadata, key);
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100000000) safe[key] = value;
  }
  for (const key of booleans) if (typeof own(metadata, key) === "boolean") safe[key] = own(metadata, key);
  for (const [key, allowed] of Object.entries(enums)) if (allowed.has(own(metadata, key))) safe[key] = own(metadata, key);
  const error = own(metadata, "error");
  const code = own(error, "code");
  if (codes.has(code)) safe.error = { code };
  return safe;
}
function emit(level, event, metadata) {
  console[level]({ event, ...sanitizeMetadata(metadata) });
}
function logEvent(_callSid, type, payload = {}) {
  emit("log", events.has(type) ? type : "VOICE_EVENT", payload);
}
function logDecision(_callSid, message, metadata = {}) { emit("log", decisions.get(message) || "VOICE_DECISION", metadata); }
function logError(_callSid, _error, metadata = {}) { emit("error", "VOICE_ERROR", metadata); }
// Module-local console replacement: free-form labels, identifiers, JSON strings,
// provider bodies and nested objects are deliberately discarded at the boundary.
const operationalConsole = Object.fromEntries(["log", "warn", "error"].map((level) => [level, (...args) => {
  const metadata = Object.assign({}, ...args.map(sanitizeMetadata));
  emit(level, diagnosticEvents.get(args[0]) || (level === "error" ? "VOICE_ERROR" : level === "warn" ? "VOICE_WARNING" : "VOICE_DIAGNOSTIC"), metadata);
}]));
module.exports = { sanitizeMetadata, operationalConsole, logEvent, logDecision, logError };
