// src/routes/twilio.js

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const express = require("express");
const router = express.Router();

const twilio = require("twilio");
const WebSocket = require("ws");
const { retrieveAnswer } = require("../../retriever");
const { synthesizeSpeech } = require("../../tts");
const { getTenantRegion } = require("../brain/utils/tenantContext");
const { createStreamingTranscriber } = require("../brain/utils/sttGoogle");


const {
  handleCallStarted,
  handleGreeting,
  handleTranscriptPartial,
  handleTranscriptFinal,
  handleProcessingResult,
  handleSpeak,
  handleSpeechComplete,
  handleCallEnded,
  handleCallerTurn,
} = require("../voice/sessionController");

const {
  normalizePhoneDigits,
  isPhoneComplete,
} = require("../voice/slotEnforcement");

const { getSession } = require("../voice/voiceSessionStore");

console.log("🧩 [twilio->tts] resolved module:", require.resolve("../../tts"));
console.log("🧩 [twilio->tts] typeof synthesizeSpeech:", typeof synthesizeSpeech);

const POST_TTS_GUARD_MS = 400;
const MIN_TRANSCRIPT_CHARS = 3;
const MIN_ALNUM_CHARS = 2;
const MIN_INTERIM_STABLE_LEN = 4;

const VOICE_TURN_SILENCE_MS = Number(process.env.VOICE_TURN_SILENCE_MS || 350);
const VOICE_STT_COOLDOWN_MS = Number(process.env.VOICE_STT_COOLDOWN_MS || 150);
const VOICE_POST_TTS_IGNORE_MS = Number(process.env.VOICE_POST_TTS_IGNORE_MS || 120);

const VOICE_MIN_UTTERANCE_CHARS = Number(process.env.VOICE_MIN_UTTERANCE_CHARS || 3);
const VOICE_MAX_REPLY_CHARS = Number(process.env.VOICE_MAX_REPLY_CHARS || 220);
const VOICE_LOG_PREFIX = "[twilio_voice_intel]";

const VOICE_MIN_AUDIO_BYTES = Number(process.env.VOICE_MIN_AUDIO_BYTES || 640);
const VOICE_MIN_AUDIO_RMS = Number(process.env.VOICE_MIN_AUDIO_RMS || 180);
const VOICE_MIN_AUDIO_PEAK = Number(process.env.VOICE_MIN_AUDIO_PEAK || 900);
const VOICE_MIN_VOICED_SAMPLES = Number(process.env.VOICE_MIN_VOICED_SAMPLES || 24);

const VOICE_MIN_BUFFER_BYTES_FOR_STT = Number(
  process.env.VOICE_MIN_BUFFER_BYTES_FOR_STT || 1600
);

const DEFAULT_TENANT_BUSINESS_TYPE = String(
  process.env.DEFAULT_TENANT_BUSINESS_TYPE || "generic"
)
  .trim()
  .toLowerCase();

const VOICE_PLAYBACK_TAIL_MS = Number(process.env.VOICE_PLAYBACK_TAIL_MS || 200);
const PHONE_CAPTURE_STALL_MS = Number(process.env.PHONE_CAPTURE_STALL_MS || 2500);  
const VOICE_PLAYBACK_PADDING_MS = Number(process.env.VOICE_PLAYBACK_PADDING_MS || 250);
const TWILIO_MULAW_BYTES_PER_SEC = 8000;

let getTenantVoiceProfile = async () => null;
try {
  ({ getTenantVoiceProfile } = require("../brain/utils/voiceProfileLoader"));
} catch (e) {
  console.warn("⚠️ [twilio] voiceProfileLoader not found, using default lang=en-US.");
}

const twilioDebugState = {
  updatedAt: null,
  events: [],
};


function pushTwilioDebug(event, details = {}) {
  const ALLOWED_EVENTS = new Set([
  "dispatch_turn",
  "reply_ready",
  "mark_received",
  "playback_lock_start",
  "playback_lock_end",
  "dispatch_skipped_incomplete",
  "stt_return",
  "stt_invalid_skipped",
  "barge_in_detected",
]);
  if (!ALLOWED_EVENTS.has(event)) return;

  const entry = {
    ts: new Date().toISOString(),
    event,
    ...details,
  };

  twilioDebugState.updatedAt = entry.ts;
  twilioDebugState.events.push(entry);

  if (twilioDebugState.events.length > 200) {
    twilioDebugState.events = twilioDebugState.events.slice(-200);
  }
}

function getTwilioDebugState() {
  return {
    updatedAt: twilioDebugState.updatedAt,
    events: [...twilioDebugState.events],
  };
}

function clearPendingVoiceTurn(ws) {
  try {
    if (ws && ws.__voiceTurnTimer) {
      clearTimeout(ws.__voiceTurnTimer);
      ws.__voiceTurnTimer = null;
    }
  } catch (_) {}
}

function normalizeIncomingVoiceText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isMeaningfulVoiceUtterance(text) {
  const value = normalizeIncomingVoiceText(text);
  if (!value) return false;
  if (value.length < VOICE_MIN_UTTERANCE_CHARS) return false;
  if (/^(hmm+|uh+|um+|mm+|ah+|eh+)$/i.test(value)) return false;
  return true;
}

function looksTaskCompleted(text) {
  const value = String(text || "").toLowerCase();

  return (
    value.includes("confirmed") ||
    value.includes("booked") ||
    value.includes("scheduled") ||
    value.includes("created successfully") ||
    value.includes("done") ||
    value.includes("completed") ||
    value.includes("your appointment is") ||
    value.includes("your booking is") ||
    value.includes("your reservation is") ||
    value.includes("i've booked") ||
    value.includes("i have booked") ||
    value.includes("i've scheduled") ||
    value.includes("i have scheduled")
  );
}

function estimatePlaybackMs(ttsBuffer) {
  const bytes = ttsBuffer?.length || 0;
  if (!bytes) return VOICE_PLAYBACK_PADDING_MS + VOICE_PLAYBACK_TAIL_MS;

  const speechMs = Math.ceil((bytes / TWILIO_MULAW_BYTES_PER_SEC) * 1000);
  return Math.min(speechMs, 900) + 80;
}

function ensurePlaybackState(ws) {
  if (!ws.__acaPlayback) {
    ws.__acaPlayback = {
      active: false,
      currentMark: null,
      ignoreInboundUntil: 0,
      lastMediaSentAt: 0,
    };
  }
  return ws.__acaPlayback;
}

function isPlaybackActive(ws) {
  const state = ensurePlaybackState(ws);
  return state.active || Date.now() < state.ignoreInboundUntil;
}

function isPlaybackLocked(ws) {
  if (!ws) return false;

  const now = Date.now();
  if (ws.__isSpeaking && now < (ws.__speakUntil || 0)) {
    return true;
  }

  if (ws.__isSpeaking && now >= (ws.__speakUntil || 0)) {
    ws.__isSpeaking = false;
    ws.__speakUntil = 0;
  }

  return isPlaybackActive(ws);
}

function beginPlaybackLock(ws, activeCallSid, activeStreamSid, ttsBuffer, branch = "main") {
  if (!ws) return;

  const holdMs = estimatePlaybackMs(ttsBuffer);
  ws.__isSpeaking = true;
  ws.__speakUntil = Date.now() + holdMs;

  const playback = ensurePlaybackState(ws);
  playback.active = true;
  playback.lastMediaSentAt = Date.now();
  playback.ignoreInboundUntil = Date.now() + VOICE_POST_TTS_IGNORE_MS;

  clearPendingVoiceTurn(ws);
  ws.__lastVoiceInputAt = 0;
  ws.__sttBufferBytes = 0;

  pushTwilioDebug("playback_lock_start", {
    callSid: activeCallSid,
    streamSid: activeStreamSid,
    holdMs,
    bytes: ttsBuffer?.length || 0,
    branch,
  });

  console.log("🔇 [twilio] playback lock started", {
    callSid: activeCallSid,
    streamSid: activeStreamSid,
    holdMs,
    bytes: ttsBuffer?.length || 0,
    branch,
  });
}

function normalizeTranscript(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isMeaningfulTranscript(text) {
  const t = normalizeTranscript(text);
  if (!t) return false;
  if (t.length < MIN_TRANSCRIPT_CHARS) return false;

  const alnum = (t.match(/[a-z0-9]/gi) || []).length;
  if (alnum < MIN_ALNUM_CHARS) return false;

  if (/^(um+|uh+|hmm+|mm+|ah+|er+|...+|[.,!?-]+)$/i.test(t)) return false;

  return true;
}

function ensureVoiceGate(session) {
  if (!session.voiceGate) {
    session.voiceGate = {
      assistantSpeaking: false,
      ignoreInputUntil: 0,
      pendingMarks: new Set(),
      lastPlaybackStartedAt: 0,
      lastPlaybackEndedAt: 0,
    };
  }
  return session.voiceGate;
}

function shouldIgnoreCallerInput(session) {
  const gate = ensureVoiceGate(session);
  return gate.assistantSpeaking || Date.now() < gate.ignoreInputUntil;
}

function beginAssistantPlayback(session, markName) {
  const gate = ensureVoiceGate(session);
  gate.assistantSpeaking = true;
  gate.lastPlaybackStartedAt = Date.now();
  gate.pendingMarks.add(markName);
}

function finishAssistantPlaybackMark(session, markName) {
  const gate = ensureVoiceGate(session);

  if (markName) {
    gate.pendingMarks.delete(markName);
  }

  if (gate.pendingMarks.size === 0) {
    gate.assistantSpeaking = false;
    gate.lastPlaybackEndedAt = Date.now();
    gate.ignoreInputUntil = Date.now() + POST_TTS_GUARD_MS;
  }
}

function endPlaybackLock(ws, activeCallSid, activeStreamSid, reason = "unknown") {
  if (!ws) return;

  ws.__isSpeaking = false;
ws.__speakUntil = 0;

const playback = ensurePlaybackState(ws);

playback.active = false;
playback.currentMark = null;
playback.ignoreInboundUntil = Date.now() + VOICE_PLAYBACK_TAIL_MS;

    ws.__lastVoiceInputAt = 0;
  ws.__sttBufferBytes = 0;

  pushTwilioDebug("playback_lock_end", {
    callSid: activeCallSid,
    streamSid: activeStreamSid,
    reason,
    ignoreInboundUntil: playback.ignoreInboundUntil,
  });

  console.log("🔊 [twilio] playback lock ended", {
    callSid: activeCallSid,
    streamSid: activeStreamSid,
    reason,
    ignoreInboundUntil: playback.ignoreInboundUntil,
  });
}

function extractDigits(text) {
  return String(text || "").replace(/\D/g, "");
}

function looksLikePhoneInput(text) {
  const raw = String(text || "").toLowerCase().trim();
  if (!raw) return false;

  const digitCount = extractDigits(raw).length;
  if (digitCount >= 3) return true;

  return /\b(my number is|phone number is|call me at|reach me at|number is)\b/i.test(raw);
}

function updatePhoneCaptureFromUtterance(session, text) {
  if (!session?.phoneCapture) {
    session.phoneCapture = { active: false, digits: "", startedAt: null };
  }

  const incomingDigits = extractDigits(text);
  const currentlyCollecting = session.phoneCapture.active;
  const shouldStart = looksLikePhoneInput(text) || session.lastAskedSlot === "phone";

  if (!shouldStart && !currentlyCollecting) {
    return {
      changed: false,
      isComplete: isPhoneComplete(session?.slots?.phone),
      suppressResponse: false,
    };
  }

  const nextDigits = `${session.phoneCapture.digits || ""}${incomingDigits || ""}`.slice(0, 15);

  session.phoneCapture.active = true;
  session.phoneCapture.digits = nextDigits;
  if (!session.phoneCapture.startedAt) session.phoneCapture.startedAt = Date.now();

  if (nextDigits.length >= 10) {
    session.slots = session.slots || {};
    session.slots.phone = nextDigits.slice(0, 10);
    session.phoneCapture.active = false;
    return {
      changed: true,
      isComplete: true,
      suppressResponse: false,
    };
  }

  return {
    changed: true,
    isComplete: false,
    suppressResponse: true,
  };
}

function sendTwilioAudioWithMark(ws, activeCallSid, activeStreamSid, ttsBuffer, branch = "main") {
  if (!ws || !activeStreamSid || !ttsBuffer?.length) return;

  if (branch !== "ack") {
  beginPlaybackLock(ws, activeCallSid, activeStreamSid, ttsBuffer, branch);
}

  const playback = ensurePlaybackState(ws);
  const payload = ttsBuffer.toString("base64");
  const markName = `aca_tts_${Date.now()}`;

  playback.currentMark = markName;

  console.log("📡  Sending media back to Twilio:", {
    callSid: activeCallSid,
    streamSid: activeStreamSid,
    bytes: ttsBuffer.length,
    branch,
    markName,
  });

  pushTwilioDebug("tts_send", {
    callSid: activeCallSid,
    streamSid: activeStreamSid,
    bytes: ttsBuffer.length,
    branch,
    markName,
  });

  console.log("📤 [twilio] Sending WS media event back to Twilio");

  ws.send(
    JSON.stringify({
      event: "media",
      streamSid: activeStreamSid,
      media: {
        payload,
      },
    })
  );

  ws.send(
    JSON.stringify({
      event: "mark",
      streamSid: activeStreamSid,
      mark: {
        name: markName,
      },
    })
  );

  console.log("🔖 [twilio] Sent mark after outbound media", {
    callSid: activeCallSid,
    streamSid: activeStreamSid,
    markName,
    branch,
    base64Chars: payload.length,
  });

  pushTwilioDebug("tts_mark_sent", {
    callSid: activeCallSid,
    streamSid: activeStreamSid,
    markName,
    branch,
  });
}

function muLawByteToLinearSample(muLawByte) {
  const MULAW_BIAS = 0x84;
  let uVal = (~muLawByte) & 0xff;
  const sign = uVal & 0x80;
  const exponent = (uVal >> 4) & 0x07;
  const mantissa = uVal & 0x0f;
  let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
  sample -= MULAW_BIAS;
  return sign ? -sample : sample;
}

function analyzeMulawAudio(buffer) {
  if (!buffer || !buffer.length) {
    return {
      rms: 0,
      peak: 0,
      voicedSamples: 0,
      sampleCount: 0,
    };
  }

  let sumSquares = 0;
  let peak = 0;
  let voicedSamples = 0;
  const sampleCount = buffer.length;

  for (let i = 0; i < buffer.length; i += 1) {
    const sample = muLawByteToLinearSample(buffer[i]);
    const abs = Math.abs(sample);
    sumSquares += sample * sample;
    if (abs > peak) peak = abs;
    if (abs >= 500) voicedSamples += 1;
  }

  const rms = Math.sqrt(sumSquares / sampleCount);

  return {
    rms: Math.round(rms),
    peak,
    voicedSamples,
    sampleCount,
  };
}

function hasEnoughCallerAudio(buffer) {
  if (!buffer || buffer.length < VOICE_MIN_AUDIO_BYTES) {
    return {
      ok: false,
      reason: "too_small",
      stats: analyzeMulawAudio(buffer),
    };
  }

  const stats = analyzeMulawAudio(buffer);

  if (stats.rms < VOICE_MIN_AUDIO_RMS && stats.peak < VOICE_MIN_AUDIO_PEAK) {
    return {
      ok: false,
      reason: "low_energy",
      stats,
    };
  }

  if (stats.voicedSamples < VOICE_MIN_VOICED_SAMPLES) {
    return {
      ok: false,
      reason: "not_voiced_enough",
      stats,
    };
  }

  return {
    ok: true,
    reason: "ok",
    stats,
  };
}

/**
 * Prefer globally-registered shared conversation handler.
 * Fallback to require("../../index") only if needed.
 */
function getSharedConversationHandler() {
  try {
    if (typeof global.__ACA_HANDLE_CONVERSATION_TURN__ === "function") {
      return global.__ACA_HANDLE_CONVERSATION_TURN__;
    }
  } catch (_) {}

  try {
    const rootModule = require("../../index");
    if (rootModule && typeof rootModule.handleConversationTurn === "function") {
      return rootModule.handleConversationTurn;
    }
  } catch (err) {
    console.warn(
      "⚠️ [twilio] Shared handleConversationTurn unavailable, fallback will be used:",
      err.message
    );
  }

  return null;
}

function normalizeVoiceReply(reply) {
  let text = "";

  if (typeof reply === "string") {
    text = reply;
  } else if (reply && typeof reply === "object") {
    text =
      reply.reply ||
      reply.answer ||
      reply.text ||
      reply.response ||
      reply.message ||
      reply.replyText ||
      "";
  }

  text = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  text = text
    .replace(
      /\s*(would you like anything else(\s*today)?\??|can i help with anything else\??|let me know if you need anything else\??)\s*$/i,
      ""
    )
    .trim();

  text = text
    .replace(/could you please/gi, "can you")
    .replace(/would you please/gi, "can you")
    .replace(/please tell me/gi, "")
    .replace(/kindly/gi, "")
    .trim();

  const parts = text.match(/[^.!?]+[.!?]?/g) || [text];
  const trimmedParts = [];
  let total = 0;

  for (const part of parts) {
    const piece = String(part || "").trim();
    if (!piece) continue;
    if (trimmedParts.length >= 2) break;
    if (total + piece.length > VOICE_MAX_REPLY_CHARS) break;

    trimmedParts.push(piece);
    total += piece.length + 1;
  }

  text = trimmedParts.join(" ").trim() || text;

  if (text.length > VOICE_MAX_REPLY_CHARS) {
    text = text.slice(0, VOICE_MAX_REPLY_CHARS).replace(/[,\s]+$/g, "").trim();
    if (!/[.!?]$/.test(text)) text += ".";
  }

  if (looksTaskCompleted(text)) {
    text = text
      .replace(
        /\s*(what else can i help with\??|anything else\??|do you need anything more\??)\s*$/i,
        ""
      )
      .trim();
  }

  return text;
}

const ACKS = ["Okay.", "Got it.", "Alright.", "Sure.", "Mm-hm."];

function pickAck(previousAck = "") {
  const filtered = ACKS.filter(
    (ack) => ack.toLowerCase() !== String(previousAck || "").toLowerCase()
  );
  const pool = filtered.length ? filtered : ACKS;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function synthesizeAndSendReply(
  ws,
  activeCallSid,
  activeStreamSid,
  tenantId,
  tenantLangCode,
  replyText,
  branch = "main"
) {
  let shapedReply = normalizeVoiceReply(replyText);
if (!shapedReply) return false;

if (branch === "ack") {
  shapedReply = shapedReply.split(/[.!?]/)[0].trim();
  if (!shapedReply) return false;
  if (!/[.!?]$/.test(shapedReply)) shapedReply += ".";
}

  console.log(
    `${VOICE_LOG_PREFIX} reply_ready`,
    JSON.stringify({
      callSid: activeCallSid,
      chars: shapedReply.length,
      completed: looksTaskCompleted(shapedReply),
      branch,
    })
  );

  pushTwilioDebug("reply_ready", {
    callSid: activeCallSid,
    chars: shapedReply.length,
    completed: looksTaskCompleted(shapedReply),
    branch,
  });

  console.log("💬  Voice reply:", shapedReply);

  let regionCode = null;
  try {
    regionCode = await getTenantRegion(tenantId);
  } catch (e) {
    console.warn(`⚠️  Failed to get tenant region for tenant=${tenantId}:`, e.message);
  }

  let ttsBuffer = null;
  try {
    console.log("🗣️ [twilio] about to call synthesizeSpeech", {
      callSid: activeCallSid,
      streamSid: activeStreamSid,
      replyPreview: String(shapedReply || "").slice(0, 120),
      hasReply: !!shapedReply,
      langCode: tenantLangCode,
      tenantId,
      regionCode,
      path: "../../tts",
      branch,
    });

    ttsBuffer = await synthesizeSpeech(shapedReply, tenantLangCode, {
      tenantId,
      regionCode,
      tonePreset: "friendly",
      useFillers: false,
      outputFormat: "ulaw_8000",
      acceptMime: "audio/mpeg",
    });

    console.log("📥 [twilio] synthesizeSpeech returned", {
      callSid: activeCallSid,
      streamSid: activeStreamSid,
      hasAudio: !!ttsBuffer,
      bytes: ttsBuffer?.length || 0,
      branch,
    });
  } catch (ttsErr) {
    console.error("❌  TTS synthesis failed:", ttsErr.message);
    pushTwilioDebug("tts_error", {
      callSid: activeCallSid,
      error: ttsErr.message,
      branch,
    });
  }

  if (ttsBuffer && activeStreamSid) {
    handleSpeak(activeCallSid);
    sendTwilioAudioWithMark(ws, activeCallSid, activeStreamSid, ttsBuffer, branch);
    return true;
  }

  if (!activeStreamSid) {
    console.warn(
      "⚠️  Skipping TTS send: activeStreamSid is missing, cannot send media event."
    );
    pushTwilioDebug("tts_skip_no_streamsid", {
      callSid: activeCallSid,
      branch,
    });
  }

  return false;
}

async function handleVoiceWebhook(req, res) {
  console.log("🛰️ Twilio webhook:", {
    method: req.method,
    query: req.query,
    body: req.body || null,
    contentType: req.headers["content-type"] || null,
  });

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const connect = twiml.connect();
  connect.stream({
    url: "wss://aca-realtime-gateway-clean.onrender.com/ws/twilio-stream",
    name: "aca-live-stream",
    statusCallback: "https://aca-realtime-gateway-clean.onrender.com/twilio/stream-status",
    statusCallbackMethod: "POST",
  });

  twiml.pause({ length: 60 });

  const xmlResponse = twiml.toString();
  console.log("📤 Returning TwiML to Twilio:\n", xmlResponse);

  res.status(200);
  res.set("Content-Type", "text/xml");
  res.send(xmlResponse);
}

function handleStatusWebhook(req, res) {
  const status = req.body?.CallStatus || "unknown";
  console.log("📡  Twilio Status update:", status);

  if (status === "completed") {
    console.log("✅  Call completed successfully.");
  } else if (status === "failed" || status === "busy") {
    console.log("⚠️  Call ended with status:", status);
  }

  res.sendStatus(200);
}

function handleStreamStatusWebhook(req, res) {
  const payload = {
    accountSid: req.body?.AccountSid || null,
    callSid: req.body?.CallSid || null,
    streamSid: req.body?.StreamSid || null,
    streamName: req.body?.StreamName || null,
    streamEvent: req.body?.StreamEvent || null,
    streamError: req.body?.StreamError || null,
    timestamp: req.body?.Timestamp || null,
  };

  console.log("📡 [twilio] Stream status callback:", payload);
  pushTwilioDebug("stream_status", payload);

  res.sendStatus(200);
}

router.post("/voice", handleVoiceWebhook);
router.get("/voice", handleVoiceWebhook);

router.post("/stream-status", handleStreamStatusWebhook);
router.get("/stream-status", handleStreamStatusWebhook);

router.post("/status", handleStatusWebhook);
router.get("/status", handleStatusWebhook);

async function handleTwilioStream(ws, req) {
  console.log("🌐  Twilio WebSocket connected");
  pushTwilioDebug("ws_connected", {});

  let activeCallSid = null;
  let activeStreamSid = null;
  let streamActive = true;
  let mediaPacketCount = 0;

  let tenantId = 1;
  let tenantLangCode = "en-US";

  ws.__voiceTurnTimer = null;
ws.__lastVoiceInputAt = 0;
ws.__lastVoiceReplyAt = 0;
ws.__isSpeaking = false;
ws.__speakUntil = 0;
ws.__acaSessionId = null;
ws.__acaStructuredFlowActive = false;
ws.__routingMeta = {};
ws.__dispatchInFlight = false;
ws.__sttInFlight = false;
ws.__sttBufferBytes = 0;
ws.__lastStableTranscript = "";
ws.__lastStableTranscriptAt = 0;
ws.__lastCommittedTranscript = "";
ws.__pendingVoiceTranscriptStartedAt = 0;
ws.__sttStream = null;
ws.__speechActive = false;
ws.__lastSpeechStartAt = 0;
ws.__lastSpeechEndAt = 0;
ws.__capturingPhone = false;
ws.__phoneDigits = "";
ws.__phoneCaptureStartedAt = 0;
ws.__phoneCaptureLastUpdatedAt = 0;

ensurePlaybackState(ws);

  function getOpenExpectedSlot() {
    if (!activeCallSid) return null;
    const session = getSession(activeCallSid);
    return session?.lastAskedSlot || null;
  }

  function normalizeSlotValue(text) {
    return String(text || "")
      .replace(/[.,!?]+$/g, "")
      .trim();
  }

  function normalizeForStability(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/[.,!?]+$/g, "")
      .trim()
      .toLowerCase();
  }

  function isTranscriptExtension(previousText, nextText) {
    const prev = normalizeForStability(previousText);
    const next = normalizeForStability(nextText);

    if (!prev || !next) return false;
    if (prev === next) return true;
    if (next.startsWith(prev)) return true;

    return false;
  }

  function noteTranscriptStability(targetWs, text) {
    const normalized = normalizeIncomingVoiceText(text);
    const previous = targetWs.__lastStableTranscript || "";

    if (!normalized) return;

    if (!previous) {
      targetWs.__lastStableTranscript = normalized;
      targetWs.__lastStableTranscriptAt = Date.now();
      return;
    }

    if (isTranscriptExtension(previous, normalized)) {
      targetWs.__lastStableTranscript = normalized;
      targetWs.__lastStableTranscriptAt = Date.now();
      return;
    }

    if (normalizeForStability(previous) !== normalizeForStability(normalized)) {
      targetWs.__lastStableTranscript = normalized;
      targetWs.__lastStableTranscriptAt = Date.now();
    }
  }

  function matchesExpectedSlot(text, expectedSlot) {
    const t = normalizeSlotValue(text);

    if (!t || !expectedSlot) return false;

    const slot = String(expectedSlot).toLowerCase();

    if (slot.includes("time")) {
      return (
        /^\d{1,2}(:\d{2})?\s?(am|pm)?$/i.test(t) ||
        /^(am|pm)$/i.test(t) ||
        /^(morning|afternoon|evening|night)$/i.test(t)
      );
    }

    if (slot.includes("date") || slot.includes("day")) {
      return (
        /^(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(
          t
        ) ||
        /^(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)$/i.test(
          t
        ) ||
        /^\d{1,2}$/.test(t)
      );
    }

    if (slot.includes("name")) {
      return /^[A-Za-z]{2,}(?:\s[A-Za-z]{2,}){0,2}$/.test(t);
    }

    if (
      slot.includes("party") ||
      slot.includes("size") ||
      slot.includes("guest") ||
      slot.includes("people") ||
      slot.includes("person")
    ) {
      return /^\d{1,2}$/.test(t);
    }

    if (slot.includes("phone")) {
      return /^[\d\s()+-]{7,}$/.test(t);
    }

    if (slot.includes("email")) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
    }

    return true;
  }

  function shouldWaitForMoreSpeech(targetWs, expectedSlot) {
  const pending = normalizeIncomingVoiceText(targetWs.__pendingVoiceTranscript);
  const stable = normalizeIncomingVoiceText(targetWs.__lastStableTranscript);
  const stableAgeMs = Date.now() - (targetWs.__lastStableTranscriptAt || 0);
  const pendingAgeMs =
    Date.now() - (targetWs.__pendingVoiceTranscriptStartedAt || Date.now());

  if (!pending) return false;

  const wordCount = pending.split(/\s+/).filter(Boolean).length;
  const stillGrowing =
    stable &&
    isTranscriptExtension(pending, stable) &&
    normalizeForStability(pending) !==
      normalizeForStability(targetWs.__lastCommittedTranscript || "");

  if (expectedSlot) {
    if (stableAgeMs < 350 && pendingAgeMs < 1400) return true;
    return false;
  }

 // allow short meaningful answers immediately
if (wordCount <= 2) {
  return false;
}

const looksCompleteSentence =
  /[.!?]$/.test(pending) ||
  /\b(at\s+\d{1,2}(:\d{2})?\s?(am|pm)?|on\s+\w+|for\s+\d+|for\s+\w+|with\s+\w+)\b/i.test(pending) ||
  wordCount >= 6;

if (looksCompleteSentence) {
  if (stableAgeMs < 120 && pendingAgeMs < 550) return true;
  return false;
}

if (stableAgeMs < 220) {
  if (pendingAgeMs < 700) return true;
  return false;
}

if (stillGrowing && stableAgeMs < 320) {
  if (pendingAgeMs < 900) return true;
  return false;
}

  return false;
}
  function isMeaningfulUtterance(text) {
    const t = String(text || "").trim();
    if (!t) return false;

    const words = t.split(/\s+/);

    if (/^(for|and|the|a|an|to|of|on|in)$/i.test(t)) return false;
    if (/^(um+|uh+|hmm+|mm+|ah+|er+)$/i.test(t)) return false;
    if (/^[a-z]+\.?$/i.test(t) && words.length === 1 && t.length <= 5) return false;

    return true;
  }

  function isValidSlotValue(text) {
    const t = String(text || "")
      .trim()
      .replace(/[.,!?]+$/g, "");

    if (/^\d{1,2}(:\d{2})?\s?(am|pm)?$/i.test(t)) return true;
    if (/^(am|pm)$/i.test(t)) return true;

    if (
      /^(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(
        t
      )
    ) {
      return true;
    }

    if (
      /^(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)$/i.test(
        t
      )
    ) {
      return true;
    }

    if (/^\d{1,2}$/.test(t)) return true;
    if (/^[A-Za-z]{2,}(?:\s[A-Za-z]{2,})?$/.test(t)) return true;

    return false;
  }

  function getCurrentSession() {
    if (!activeCallSid) return null;
    try {
      return getSession(activeCallSid);
    } catch (_) {
      return null;
    }
  }

  function normalizeSlotText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[.,!?]+$/g, "")
      .trim();
  }

  function isWeakFragment(text) {
    const t = normalizeSlotText(text);

    if (!t) return true;

    return [
      "looking for",
      "are you",
      "yes i said",
      "that is",
      "its",
      "it's",
      "appointment",
      "doctor",
      "doctors",
      "mint",
      "point",
      "being well",
      "into 1 month",
      "support 1 month",
      "did you get it",
      "you get it",
    ].includes(t);
  }


function isPhoneSlot(expectedSlot) {
  return !!(
    expectedSlot &&
    String(expectedSlot).toLowerCase().includes("phone")
  );
}

function stripPhoneIntro(text) {
  return String(text || "").replace(
    /.*?\b(?:my (?:phone )?number is|phone number is|number is|my number is|it's|it is)\b[:\s-]*/i,
    ""
  );
}

function startsPhoneCapture(text, expectedSlot) {
  const raw = String(text || "");
  const digits = normalizePhoneDigits(raw);

  if (isPhoneSlot(expectedSlot) && digits.length > 0) {
    return true;
  }

  const hasPhoneIntro =
    /\b(?:my (?:phone )?number is|phone number is|number is|my number is)\b/i.test(raw);

  const hasMixedIntent =
    /\b(book|appointment|table|reservation|tomorrow|today|evening|morning|afternoon|name is)\b/i.test(raw);

  if (hasPhoneIntro && digits.length > 0 && !hasMixedIntent) {
    return true;
  }

  if (/^[\d\s()+-]{3,}$/.test(raw) && digits.length >= 3) {
    return true;
  }

  return false;
}

function appendPhoneDigits(ws, text) {
  const raw = String(text || "");
  const source = /\b(?:my (?:phone )?number is|phone number is|number is|my number is)\b/i.test(raw)
    ? stripPhoneIntro(raw)
    : raw;

  const incomingDigits = normalizePhoneDigits(source);
  if (!incomingDigits) return ws.__phoneDigits || "";

  const current = ws.__phoneDigits || "";

  if (!current) {
    ws.__phoneDigits = incomingDigits;
    return ws.__phoneDigits;
  }

  // avoid duplicate re-append of the same chunk
  if (current.endsWith(incomingDigits)) {
    return current;
  }

  // append only the non-overlapping tail
  let overlap = 0;
  const maxOverlap = Math.min(current.length, incomingDigits.length);

  for (let i = maxOverlap; i >= 1; i -= 1) {
    if (current.slice(-i) === incomingDigits.slice(0, i)) {
      overlap = i;
      break;
    }
  }

  ws.__phoneDigits = current + incomingDigits.slice(overlap);
  return ws.__phoneDigits;
}

function resetPhoneCapture(ws) {
  ws.__capturingPhone = false;
  ws.__phoneDigits = "";
  ws.__phoneCaptureStartedAt = 0;
  ws.__phoneCaptureLastUpdatedAt = 0;
}

 // FULL UPDATED twilio.js (FIXED VERSION)
// NOTE: This is your corrected version with:
// - non-blocking phone capture
// - correct identity guard
// - no premature transcript clearing
// - faster turn dispatch
// - fixed barge-in behavior

// ⚠️ IMPORTANT:
// This is a trimmed + corrected core around dispatchPendingVoiceTurn
// Paste this ONLY replacing your dispatchPendingVoiceTurn function

async function dispatchPendingVoiceTurn() {
  let finalVoiceText = normalizeIncomingVoiceText(ws.__pendingVoiceTranscript);
  const session = getCurrentSession();
  const expectedSlot = session?.lastAskedSlot || null;
  const now = Date.now();

  const incomingDigits = normalizePhoneDigits(finalVoiceText);

  // =========================
  // PHONE CAPTURE (NON-BLOCKING)
  // =========================
  if (!ws.__capturingPhone && startsPhoneCapture(finalVoiceText, expectedSlot)) {
    ws.__capturingPhone = true;
    ws.__phoneCaptureStartedAt = now;
    ws.__phoneCaptureLastUpdatedAt = now;
    ws.__phoneDigits = "";
  }

  if (ws.__capturingPhone) {
    if (incomingDigits) {
      appendPhoneDigits(ws, finalVoiceText);
      ws.__phoneCaptureLastUpdatedAt = now;
    }

    let digits = ws.__phoneDigits || "";

    if (digits.length === 11 && digits.startsWith("1")) {
      digits = digits.slice(1);
      ws.__phoneDigits = digits;
    }

   if (digits.length >= 10) {
  finalVoiceText = digits.slice(0, 10);
  resetPhoneCapture(ws);
} else {
  pushTwilioDebug("dispatch_skipped_incomplete", {
    callSid: activeCallSid,
    text: finalVoiceText,
    reason: "phone_accumulating",
    expectedSlot,
  });

  // ✅ BLOCK ONLY numeric-only fragments
  // 🚀 keep phone capture active until full number is collected
// 🚀 STRICT phone capture lock (final fix)

const digitsNow = normalizePhoneDigits(finalVoiceText);

// Detect true intent switch
const looksLikeNewIntent =
  /\b(book|appointment|cancel|change|reschedule|help|question|start over)\b/i.test(
    finalVoiceText
  );

// Detect conversational noise (should NOT trigger dispatch)
const isPhoneConversationNoise =
  /\b(phone|number|said|told|did you|get it|hear me)\b/i.test(finalVoiceText);

// 🔴 HARD LOCK until phone is complete
if (ws.__capturingPhone && (ws.__phoneDigits || "").length < 10) {
  const digitsSoFar = ws.__phoneDigits || "";
  const noNewDigits = !incomingDigits;
  const stalledForMs = Date.now() - (ws.__phoneCaptureLastUpdatedAt || ws.__phoneCaptureStartedAt || Date.now());

  const askingAboutPhone =
    /\b(phone|number|did you get|are you there|hello|can you hear me)\b/i.test(finalVoiceText);

  if (!looksLikeNewIntent) {
    if (noNewDigits && (askingAboutPhone || stalledForMs >= PHONE_CAPTURE_STALL_MS)) {
      resetPhoneCapture(ws);

      await synthesizeAndSendReply(
        ws,
        activeCallSid,
        activeStreamSid,
        tenantId,
        tenantLangCode,
        "I only got part of the number. Could you please repeat the full 10-digit phone number?",
        "main"
      );

      ws.__pendingVoiceTranscript = "";
      ws.__pendingVoiceTranscriptStartedAt = 0;
      ws.__streamingInterim = "";
      ws.__streamingFinal = "";
      return;
    }

    return;
  }
}
}
  }

  // =========================
  // INCOMPLETE IDENTITY GUARD
  // =========================
  if (/^(my name is|i am|this is)$/i.test(finalVoiceText.trim())) {
    pushTwilioDebug("dispatch_skipped_incomplete", {
      callSid: activeCallSid,
      text: finalVoiceText,
      reason: "incomplete_identity_phrase",
      expectedSlot,
    });

    clearPendingVoiceTurn(ws);

    ws.__voiceTurnTimer = setTimeout(async () => {
      if (isPlaybackLocked(ws)) return;
      await dispatchPendingVoiceTurn();
    }, 900);

    return;
  }

  // =========================
  // TURN STABILITY
  // =========================
  if (shouldWaitForMoreSpeech(ws, expectedSlot)) {
    clearPendingVoiceTurn(ws);

    ws.__voiceTurnTimer = setTimeout(async () => {
      if (isPlaybackLocked(ws)) return;
      await dispatchPendingVoiceTurn();
    }, expectedSlot ? 90 : 110);

    return;
  }

  if (!finalVoiceText) return;

  // =========================
  // DISPATCH
  // =========================
  ws.__voiceTurnTimer = null;

  if (ws.__dispatchInFlight) return;
  if (isPlaybackLocked(ws)) return;

  if (!isMeaningfulVoiceUtterance(finalVoiceText)) return;

  ws.__dispatchInFlight = true;

  try {
    pushTwilioDebug("dispatch_turn", {
      callSid: activeCallSid,
      text: finalVoiceText.slice(0, 120),
    });

    const finalResult = handleTranscriptFinal(activeCallSid, finalVoiceText);
    if (!finalResult || !finalResult.shouldProcess) return;

    let reply = "";

try {
  const turnResult = await handleCallerTurn({
    callSid: activeCallSid,
    transcript: finalVoiceText,
    meta: ws.__routingMeta || {},
  });

  reply = normalizeVoiceReply(turnResult?.replyText || "");
} catch (err) {
  console.warn("handleCallerTurn failed", err.message);
}

const controllerReply = handleProcessingResult(activeCallSid, {
  shouldSpeak: true,
  replyText: reply || "",
});

if (!controllerReply?.shouldSpeak) {
  return;
}

const safeReply = normalizeVoiceReply(controllerReply.replyText || "");

if (!safeReply) {
  await synthesizeAndSendReply(
    ws,
    activeCallSid,
    activeStreamSid,
    tenantId,
    tenantLangCode,
    "Sorry, could you say that again?",
    "main"
  );
  return;
}

    await synthesizeAndSendReply(
      ws,
      activeCallSid,
      activeStreamSid,
      tenantId,
      tenantLangCode,
      safeReply,
      "main"
    );

    // ✅ ONLY PLACE WHERE WE CLEAR
    ws.__lastCommittedTranscript = finalVoiceText;
    ws.__pendingVoiceTranscript = "";
    ws.__pendingVoiceTranscriptStartedAt = 0;
    ws.__streamingInterim = "";
    ws.__streamingFinal = "";
    resetPhoneCapture(ws);

  } finally {
    ws.__dispatchInFlight = false;
  }
}

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("📥 [twilio] WS event:", data?.event || "(unknown)");

      if (data.event === "start") {
        const customParams = data.start.customParameters || {};

        console.log("🧭 [twilio] customParameters:", customParams);

        tenantId = customParams.tenantId || customParams.tenant_id || tenantId;

        const calledNumber =
          customParams.calledNumber ||
          customParams.called_number ||
          customParams.to ||
          customParams.To ||
          null;

        const businessId = customParams.businessId || customParams.business_id || null;

        ws.__routingMeta = {
          tenantId,
          businessId,
          calledNumber,
          callSid: data.start.callSid,
          streamSid: data.start.streamSid,
        };

        console.log("🧭 [twilio] resolved routing meta:", ws.__routingMeta);
        activeCallSid = data.start.callSid;
        activeStreamSid = data.start.streamSid;
        streamActive = true;
        mediaPacketCount = 0;

        pushTwilioDebug("start", {
          callSid: activeCallSid,
          streamSid: activeStreamSid,
        });

        ws.__voiceTurnTimer = null;
        ws.__pendingVoiceTranscript = "";
        ws.__lastVoiceInputAt = 0;
        ws.__lastVoiceReplyAt = 0;
        ws.__isSpeaking = false;
        ws.__speakUntil = 0;
        ws.__acaSessionId = `call_${activeCallSid || activeStreamSid || Date.now()}`;
        ws.__acaStructuredFlowActive = false;
        ws.__dispatchInFlight = false;
        ws.__sttInFlight = false;
        ws.__lastStableTranscript = "";
        ws.__lastStableTranscriptAt = 0;
        ws.__lastCommittedTranscript = "";
        ws.__pendingVoiceTranscriptStartedAt = 0;
        ws.__lastAckText = "";
        

        const playback = ensurePlaybackState(ws);
        playback.active = false;
        playback.currentMark = null;
        playback.ignoreInboundUntil = 0;
        playback.lastMediaSentAt = 0;

        console.log("🎬  Stream started:", {
          callSid: activeCallSid,
          streamSid: activeStreamSid,
          acaSessionId: ws.__acaSessionId,
        });

        handleCallStarted(activeCallSid, {
          tenantId,
          businessId: null,
          streamSid: activeStreamSid,
          source: "twilio",
        });

        if (
          String(activeCallSid || "").startsWith("CA_TEST_") ||
          String(activeCallSid || "").startsWith("CA_LOCAL_")
        ) {
          try {
            ws.send(
              JSON.stringify({
                event: "debug_ack",
                ok: true,
                callSid: activeCallSid,
                streamSid: activeStreamSid,
                source: "handleTwilioStream:start",
              })
            );
            console.log("🧪 [twilio_test_ack] sent", {
              callSid: activeCallSid,
              streamSid: activeStreamSid,
            });
          } catch (ackErr) {
            console.error("❌ [twilio_test_ack] failed:", ackErr.message);
          }
        }

        console.log(
          `${VOICE_LOG_PREFIX} init`,
          JSON.stringify({
            callSid: activeCallSid,
            silenceMs: VOICE_TURN_SILENCE_MS,
            sttCooldownMs: VOICE_STT_COOLDOWN_MS,
            postTtsIgnoreMs: VOICE_POST_TTS_IGNORE_MS,
            minAudioBytes: VOICE_MIN_AUDIO_BYTES,
            minAudioRms: VOICE_MIN_AUDIO_RMS,
            minAudioPeak: VOICE_MIN_AUDIO_PEAK,
          })
        );

        try {
          if (getTenantVoiceProfile) {
            const profile = await getTenantVoiceProfile(tenantId, null);
            if (profile && profile.language_code) {
              tenantLangCode = profile.language_code;
              console.log("🌍 [twilio] Using tenant voice language:", {
                tenantId,
                language_code: tenantLangCode,
              });
            } else {
              console.log(
                "🌍 [twilio] No tenant-specific language_code found, using default en-US."
              );
            }
          }
        } catch (e) {
          console.warn(
            `⚠️ [twilio] Failed to load tenant voice profile for tenant=${tenantId}:`,
            e.message
          );
        }
if (ws.__sttStream) {
  ws.__sttStream.destroy();
  ws.__sttStream = null;
}

ws.__streamingInterim = "";
ws.__streamingFinal = "";
ws.__speechActive = false;
ws.__lastSpeechStartAt = 0;
ws.__lastSpeechEndAt = 0;
ws.__capturingPhone = false;
ws.__phoneDigits = "";
ws.__phoneCaptureStartedAt = 0;
ws.__phoneCaptureLastUpdatedAt = 0;

ws.__sttStream = createStreamingTranscriber({
  languageCode: tenantLangCode,

  onInterim: (text) => {
    if (isPlaybackLocked(ws)) return;

    const cleaned = normalizeIncomingVoiceText(text);
    if (!cleaned) return;

    ws.__speechActive = true;
    ws.__lastSpeechStartAt = ws.__lastSpeechStartAt || Date.now();
    ws.__streamingInterim = cleaned;

    handleTranscriptPartial(activeCallSid, cleaned);
    noteTranscriptStability(ws, cleaned);
  },

  onFinal: (text) => {
    if (isPlaybackLocked(ws)) return;

    const cleaned = normalizeIncomingVoiceText(text);
    if (!cleaned) return;

    ws.__streamingFinal = cleaned;
    ws.__pendingVoiceTranscript = cleaned;
    ws.__pendingVoiceTranscriptStartedAt =
      ws.__pendingVoiceTranscriptStartedAt || Date.now();
    ws.__lastVoiceInputAt = Date.now();

    clearPendingVoiceTurn(ws);

    ws.__voiceTurnTimer = setTimeout(async () => {
      try {
        await dispatchPendingVoiceTurn();
      } catch (err) {
        console.error(`${VOICE_LOG_PREFIX} streaming_final_dispatch_error`, {
          callSid: activeCallSid,
          error: err?.message || String(err),
        });
      }
    }, 120);
  },

  onSpeechStart: () => {
    ws.__speechActive = true;
    ws.__lastSpeechStartAt = Date.now();

    if (isPlaybackLocked(ws)) {
      const liveSession = getSession(activeCallSid);
      const livePlayback = ensurePlaybackState(ws);

      endPlaybackLock(ws, activeCallSid, activeStreamSid, "barge_in");

      ws.__isSpeaking = false;
      ws.__speakUntil = 0;

      if (liveSession && liveSession.voiceGate) {
        liveSession.voiceGate.assistantSpeaking = false;
        liveSession.voiceGate.pendingMarks.clear();
      }

      livePlayback.currentMark = null;
    }
  },

  onSpeechEnd: () => {
    ws.__speechActive = false;
    ws.__lastSpeechEndAt = Date.now();

    if (ws.__streamingInterim && !ws.__streamingFinal) {
      ws.__pendingVoiceTranscript = ws.__streamingInterim;
      ws.__pendingVoiceTranscriptStartedAt =
        ws.__pendingVoiceTranscriptStartedAt || Date.now();

      clearPendingVoiceTurn(ws);

      ws.__voiceTurnTimer = setTimeout(async () => {
        try {
          await dispatchPendingVoiceTurn();
        } catch (err) {
          console.error(`${VOICE_LOG_PREFIX} speech_end_dispatch_error`, {
            callSid: activeCallSid,
            error: err?.message || String(err),
          });
        }
      }, 220);
    }
  },

  onError: (err) => {
    console.error("❌ [stt-stream] error:", err?.message || err);
  },
});
        const greetingResult = handleGreeting(activeCallSid);
        if (greetingResult && greetingResult.shouldSpeak && streamActive) {
          await synthesizeAndSendReply(
            ws,
            activeCallSid,
            activeStreamSid,
            tenantId,
            tenantLangCode,
            greetingResult.replyText,
            "greeting"
          );
        }
      } else if (data.event === "media" && data.media && data.media.payload) {
        mediaPacketCount += 1;

        const payloadBuffer = Buffer.from(data.media.payload, "base64");

        // 🔥 HARD BARGE-IN DETECTION (NEW)
const session = getSession(activeCallSid);
const playback = ensurePlaybackState(ws);

// detect ANY speech while assistant is speaking
const userTalkingWhileAssistant =
  ws.__isSpeaking ||
  playback.active ||
  (session && session.voiceGate && session.voiceGate.assistantSpeaking);

// lightweight energy check (reuse your analyzer)
const audioCheckFast = analyzeMulawAudio(payloadBuffer);

// if real speech detected → INTERRUPT immediately
if (
  userTalkingWhileAssistant &&
  (audioCheckFast.rms > VOICE_MIN_AUDIO_RMS ||
 audioCheckFast.peak > VOICE_MIN_AUDIO_PEAK)
) {
  console.log("🛑 [BARGE-IN] User started speaking — interrupting TTS", {
    callSid: activeCallSid,
    rms: audioCheckFast.rms,
    peak: audioCheckFast.peak,
  });

  pushTwilioDebug("barge_in_detected", {
    callSid: activeCallSid,
    rms: audioCheckFast.rms,
    peak: audioCheckFast.peak,
  });

  // 🔴 HARD STOP playback immediately
  endPlaybackLock(ws, activeCallSid, activeStreamSid, "barge_in");

  // 🔴 reset speaking flags
  ws.__isSpeaking = false;
  ws.__speakUntil = 0;

  if (session && session.voiceGate) {
    session.voiceGate.assistantSpeaking = false;
    session.voiceGate.pendingMarks.clear();
  }

  // 🔴 clear any pending assistant audio
  
  // IMPORTANT: do NOT return — continue processing user speech
}

        if (mediaPacketCount <= 5 || mediaPacketCount % 50 === 0) {
          pushTwilioDebug("media", {
            callSid: activeCallSid,
            streamSid: activeStreamSid,
            mediaPacketCount,
            payloadBytes: payloadBuffer.length,
          });
        }

        if (mediaPacketCount <= 5 || mediaPacketCount % 25 === 0) {
          console.log("🎧 [twilio] Media packet received:", {
            callSid: activeCallSid,
            streamSid: activeStreamSid,
            mediaPacketCount,
            payloadBytes: payloadBuffer.length,
          });
        }

        if (!payloadBuffer.length) {
          return;
        }

        if (isPlaybackLocked(ws)) {
          if (mediaPacketCount <= 5 || mediaPacketCount % 50 === 0) {
            pushTwilioDebug("media_ignored_playback_lock", {
              callSid: activeCallSid,
              streamSid: activeStreamSid,
              mediaPacketCount,
            });
          }
          return;
        }
if (ws.__sttStream) {
  ws.__sttStream.writeAudio(payloadBuffer);
}
return;
      } else if (data.event === "mark") {
        const playback = ensurePlaybackState(ws);
        const markName = data.mark && data.mark.name;

        console.log("🔖 [twilio] mark received", {
          callSid: activeCallSid,
          streamSid: activeStreamSid,
          markName,
          expectedMark: playback.currentMark,
        });

        pushTwilioDebug("mark_received", {
          callSid: activeCallSid,
          streamSid: activeStreamSid,
          markName,
          expectedMark: playback.currentMark,
        });

        if (markName && playback.currentMark && markName === playback.currentMark) {
          endPlaybackLock(ws, activeCallSid, activeStreamSid, "mark_received");
          handleSpeechComplete(activeCallSid);
        }
      } else if (data.event === "stop") {
        console.log("🛑  Stream stopped for Call SID:", data.stop.callSid);
        if (ws.__sttStream) {
  ws.__sttStream.end();
  ws.__sttStream = null;
}
        pushTwilioDebug("stop", {
          callSid: data?.stop?.callSid || activeCallSid,
        });
        
        streamActive = false;
ws.__sttBufferBytes = 0;
clearPendingVoiceTurn(ws);
endPlaybackLock(ws, activeCallSid, activeStreamSid, "stream_stop");
resetPhoneCapture(ws);
handleCallEnded(activeCallSid);
      }
    } catch (err) {
      console.error("❌  Stream error:", err);
      pushTwilioDebug("stream_error", {
        error: err?.message || String(err),
      });
    }
  });

   ws.on("close", () => {
    if (ws.__sttStream) {
  ws.__sttStream.destroy();
  ws.__sttStream = null;
}
    clearPendingVoiceTurn(ws);
    pushTwilioDebug("ws_closed", {
      callSid: activeCallSid,
    });
    console.log(
      `${VOICE_LOG_PREFIX} socket_closed`,
      JSON.stringify({
        callSid: activeCallSid,
      })
    );
    console.log("⚡  Twilio WebSocket disconnected");
    streamActive = false;
ws.__sttBufferBytes = 0;
endPlaybackLock(ws, activeCallSid, activeStreamSid, "ws_close");
resetPhoneCapture(ws);
handleCallEnded(activeCallSid);
  });
}

module.exports = {
  router,
  handleTwilioStream,
  getTwilioDebugState,
};