// src/routes/twilio.js
const express = require("express");
const router = express.Router();

const twilio = require("twilio");
const path = require("path");
const WebSocket = require("ws");
const { retrieveAnswer } = require("../../retriever");
const { synthesizeSpeech } = require("../../tts");
const { getTenantRegion } = require("../brain/utils/tenantContext");
const { transcribeMulaw } = require("../brain/utils/sttGoogle");

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

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

console.log("🧩 [twilio->tts] resolved module:", require.resolve("../../tts"));
console.log("🧩 [twilio->tts] typeof synthesizeSpeech:", typeof synthesizeSpeech);

const VOICE_TURN_SILENCE_MS = Number(process.env.VOICE_TURN_SILENCE_MS || 550);
const VOICE_STT_COOLDOWN_MS = Number(process.env.VOICE_STT_COOLDOWN_MS || 250);
const VOICE_POST_TTS_IGNORE_MS = Number(process.env.VOICE_POST_TTS_IGNORE_MS || 300);

const VOICE_MIN_UTTERANCE_CHARS = Number(process.env.VOICE_MIN_UTTERANCE_CHARS || 3);
const VOICE_MAX_REPLY_CHARS = Number(process.env.VOICE_MAX_REPLY_CHARS || 220);
const VOICE_LOG_PREFIX = "[twilio_voice_intel]";

const DEFAULT_TENANT_BUSINESS_TYPE = String(
  process.env.DEFAULT_TENANT_BUSINESS_TYPE || "generic"
)
  .trim()
  .toLowerCase();

const VOICE_PLAYBACK_TAIL_MS = Number(process.env.VOICE_PLAYBACK_TAIL_MS || 200);
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
  return speechMs + VOICE_PLAYBACK_PADDING_MS + VOICE_PLAYBACK_TAIL_MS;
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
  ws.__pendingVoiceTranscript = "";

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

function endPlaybackLock(ws, activeCallSid, activeStreamSid, reason = "unknown") {
  if (!ws) return;

  ws.__isSpeaking = false;
  ws.__speakUntil = 0;

  const playback = ensurePlaybackState(ws);
  playback.active = false;
  playback.currentMark = null;
  playback.ignoreInboundUntil = Date.now() + VOICE_PLAYBACK_TAIL_MS;

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

function sendTwilioAudioWithMark(ws, activeCallSid, activeStreamSid, ttsBuffer, branch = "main") {
  if (!ws || !activeStreamSid || !ttsBuffer?.length) return;

  beginPlaybackLock(ws, activeCallSid, activeStreamSid, ttsBuffer, branch);

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

  text = text.replace(
    /\s*(would you like anything else(\s*today)?\??|can i help with anything else\??|let me know if you need anything else\??)\s*$/i,
    ""
  ).trim();

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
    text = text.replace(
      /\s*(what else can i help with\??|anything else\??|do you need anything more\??)\s*$/i,
      ""
    ).trim();
  }

  return text;
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
  const shapedReply = normalizeVoiceReply(replyText);
  if (!shapedReply) return false;

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
    console.warn(
      `⚠️  Failed to get tenant region for tenant=${tenantId}:`,
      e.message
    );
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
    sendTwilioAudioWithMark(
      ws,
      activeCallSid,
      activeStreamSid,
      ttsBuffer,
      branch
    );
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
  console.log("🛰️  Incoming Twilio Voice webhook:", req.body);

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const streamUrl = `${process.env.ALPHINE_STREAM_BASE}/ws/twilio-stream`;
  console.log("🔗 [twilio] Stream target:", streamUrl);
  console.log(
    "🔗 [twilio] ALPHINE_STREAM_BASE =",
    process.env.ALPHINE_STREAM_BASE || "(missing)"
  );

  const connect = twiml.connect();
  connect.stream({
    url: streamUrl,
    name: "aca-live-stream",
    statusCallback: `${
      process.env.RENDER_BASE_URL || "https://aca-realtime-gateway-clean.onrender.com"
    }/twilio/stream-status`,
    statusCallbackMethod: "POST",
  });

  twiml.pause({ length: 15 });

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
  let lastResponseAt = 0;
  let streamActive = true;
  let sttBuffers = [];
  let mediaPacketCount = 0;

  let tenantId = 1;
  let tenantLangCode = "en-US";

  ws.__voiceTurnTimer = null;
  ws.__pendingVoiceTranscript = "";
  ws.__lastVoiceInputAt = 0;
  ws.__lastVoiceReplyAt = 0;
  ws.__isSpeaking = false;
  ws.__speakUntil = 0;
  ws.__acaSessionId = null;
  ws.__acaStructuredFlowActive = false;
  ws.__routingMeta = {};
  ws.__dispatchInFlight = false;
  ensurePlaybackState(ws);

  async function onFinalTranscript(userText) {
    const safeText = normalizeIncomingVoiceText(userText);
    if (!safeText) return "";

    const sessionId =
      ws.__acaSessionId ||
      `call_${activeCallSid || activeStreamSid || "unknown"}`;

    const sharedHandler = getSharedConversationHandler();

    if (sharedHandler) {
      try {
        const sharedResult = await sharedHandler({
          sessionId,
          message: safeText,
          channel: "voice",
          tenantBusinessType: DEFAULT_TENANT_BUSINESS_TYPE,
          tenantId,
          locale: tenantLangCode,
        });

        if (sharedResult && sharedResult.ok) {
          if (sharedResult.scenario) {
            ws.__acaStructuredFlowActive = true;
          }

          const normalizedSharedReply = normalizeVoiceReply(sharedResult.reply);

          console.log("🧠 [twilio] Shared conversation handler reply:", {
            callSid: activeCallSid,
            sessionId,
            user: safeText,
            bot: normalizedSharedReply,
            scenario: sharedResult.scenario || null,
            source: sharedResult.source || null,
            context: sharedResult.context || "",
          });

          if (normalizedSharedReply) {
            return normalizedSharedReply;
          }
        }

        if (ws.__acaStructuredFlowActive) {
          console.warn(
            "⚠️ [twilio] Structured flow active but shared handler returned empty reply; refusing stateless fallback.",
            {
              callSid: activeCallSid,
              sessionId,
            }
          );
          return "Sorry — could you repeat that once for me?";
        }
      } catch (err) {
        console.warn("⚠️ [twilio] Shared handler failed:", err.message);

        if (ws.__acaStructuredFlowActive) {
          console.warn(
            "⚠️ [twilio] Structured flow already active; refusing retrieveAnswer fallback.",
            {
              callSid: activeCallSid,
              sessionId,
              error: err.message,
            }
          );
          return "Sorry — could you say that again?";
        }
      }
    }

    const fallbackReply = await retrieveAnswer(
      safeText,
      tenantId,
      tenantLangCode,
      activeCallSid
    );

    const normalizedFallbackReply = normalizeVoiceReply(fallbackReply);

    console.log("💬 [twilio:fallback]", {
      callSid: activeCallSid,
      sessionId,
      user: safeText,
      bot: normalizedFallbackReply,
    });

    return normalizedFallbackReply;
  }

  async function dispatchPendingVoiceTurn() {
    if (ws.__dispatchInFlight) {
      pushTwilioDebug("dispatch_skipped_inflight", {
        callSid: activeCallSid,
        streamSid: activeStreamSid,
      });
      return;
    }

    const finalVoiceText = normalizeIncomingVoiceText(ws.__pendingVoiceTranscript);

    ws.__voiceTurnTimer = null;
    ws.__pendingVoiceTranscript = "";

    if (!streamActive) return;
    if (isPlaybackLocked(ws)) {
      pushTwilioDebug("dispatch_skipped_playback_lock", {
        callSid: activeCallSid,
        streamSid: activeStreamSid,
      });
      return;
    }

    if (!isMeaningfulVoiceUtterance(finalVoiceText)) {
      console.log(
        `${VOICE_LOG_PREFIX} skip_non_meaningful`,
        JSON.stringify({
          callSid: activeCallSid,
          text: finalVoiceText,
        })
      );
      pushTwilioDebug("utterance_skipped", {
        callSid: activeCallSid,
        text: finalVoiceText,
      });
      return;
    }

    ws.__dispatchInFlight = true;

    try {
      console.log(
        `${VOICE_LOG_PREFIX} dispatch_turn`,
        JSON.stringify({
          callSid: activeCallSid,
          text: finalVoiceText,
        })
      );
      pushTwilioDebug("dispatch_turn", {
        callSid: activeCallSid,
        text: finalVoiceText.slice(0, 120),
      });

      const finalResult = handleTranscriptFinal(activeCallSid, finalVoiceText);
      if (!finalResult || !finalResult.shouldProcess) {
        pushTwilioDebug("dispatch_skipped_controller", {
          callSid: activeCallSid,
          text: finalVoiceText.slice(0, 120),
        });
        return;
      }

      let reply = "";

      try {
        const turnResult = await handleCallerTurn({
          callSid: activeCallSid,
          transcript: finalVoiceText,
          meta: ws.__routingMeta || {},
        });

        reply = turnResult?.replyText || "";

        if (!reply) {
  console.warn("⚠️ No reply from workflow — forcing controller fallback");

  reply = "Sorry — could you repeat that once for me?";
}

      const controllerReply = handleProcessingResult(activeCallSid, {
        shouldSpeak: true,
        replyText: reply,
        replyType: looksTaskCompleted(reply) ? "result" : "reply",
      });

      if (!controllerReply || !controllerReply.shouldSpeak) {
        pushTwilioDebug("reply_blocked_controller", {
          callSid: activeCallSid,
        });
        return;
      }

      await synthesizeAndSendReply(
        ws,
        activeCallSid,
        activeStreamSid,
        tenantId,
        tenantLangCode,
        controllerReply.replyText,
        "main"
      );
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

        tenantId =
          customParams.tenantId ||
          customParams.tenant_id ||
          tenantId;

        const calledNumber =
          customParams.calledNumber ||
          customParams.called_number ||
          customParams.to ||
          customParams.To ||
          null;

        const businessId =
          customParams.businessId ||
          customParams.business_id ||
          null;

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
        sttBuffers = [];
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
      } else if (data.event === "media" && data.media.payload) {
        mediaPacketCount += 1;

        const payloadBuffer = Buffer.from(data.media.payload, "base64");

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

        sttBuffers.push(payloadBuffer);

        const now = Date.now();
        if (now - lastResponseAt < VOICE_STT_COOLDOWN_MS) {
          return;
        }
        lastResponseAt = now;

        let userText = "";
        try {
          const combined = Buffer.concat(sttBuffers);
          sttBuffers = [];

          pushTwilioDebug("stt_begin", {
            callSid: activeCallSid,
            streamSid: activeStreamSid,
            bufferedBytes: combined.length,
            languageCode: tenantLangCode,
          });

          userText = await transcribeMulaw(combined, {
            languageCode: tenantLangCode,
          });

          console.log("📝 [stt] Raw transcript result:", {
            callSid: activeCallSid,
            text: userText,
            length: String(userText || "").length,
          });

          if (!userText || userText.trim().length === 0) {
            console.warn("⚠️ [STT ISSUE] Empty transcript detected", {
              callSid: activeCallSid,
              bufferedBytes: combined.length,
              languageCode: tenantLangCode,
            });
          }

          pushTwilioDebug("stt_return", {
            callSid: activeCallSid,
            text: String(userText || "").slice(0, 120),
            length: String(userText || "").length,
          });
        } catch (sttErr) {
          console.error(
            "❌ [stt] Transcription failed; skipping this chunk:",
            sttErr.message
          );
          pushTwilioDebug("stt_error", {
            callSid: activeCallSid,
            error: sttErr.message,
          });
          userText = "";
        }

        userText = normalizeIncomingVoiceText(userText);
        const cleanedText = normalizeIncomingVoiceText(userText);

        if (!cleanedText || cleanedText.length < 2) {
          pushTwilioDebug("stt_invalid_skipped", {
            callSid: activeCallSid,
            raw: userText,
            cleaned: cleanedText,
          });
          return;
        }

        console.log(`👂  Heard (Call ${activeCallSid}):`, userText);

        handleTranscriptPartial(activeCallSid, cleanedText);

        if (ws.__pendingVoiceTranscript) {
          ws.__pendingVoiceTranscript = `${ws.__pendingVoiceTranscript} ${userText}`.trim();
        } else {
          ws.__pendingVoiceTranscript = userText;
        }

        const previousInputAt = ws.__lastVoiceInputAt || 0;
        const inputAt = Date.now();
        const deltaFromPreviousInput = previousInputAt > 0 ? inputAt - previousInputAt : 0;
        ws.__lastVoiceInputAt = inputAt;

        clearPendingVoiceTurn(ws);

        const adjustedDelay = previousInputAt > 0
          ? Math.max(180, VOICE_TURN_SILENCE_MS - Math.min(deltaFromPreviousInput, 250))
          : VOICE_TURN_SILENCE_MS;

        ws.__voiceTurnTimer = setTimeout(async () => {
          try {
            if (isPlaybackLocked(ws)) {
              console.log("⏸️ [twilio] final transcript ignored during ACA playback", {
                callSid: activeCallSid,
                streamSid: activeStreamSid,
              });
              pushTwilioDebug("dispatch_ignored_playback", {
                callSid: activeCallSid,
                streamSid: activeStreamSid,
              });
              return;
            }

            await dispatchPendingVoiceTurn();
          } catch (err) {
            console.error(
              `${VOICE_LOG_PREFIX} dispatch_error`,
              JSON.stringify({
                callSid: activeCallSid,
                error: err?.message || String(err),
              })
            );
            pushTwilioDebug("dispatch_error", {
              callSid: activeCallSid,
              error: err?.message || String(err),
            });
          }
        }, adjustedDelay);
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
        pushTwilioDebug("stop", {
          callSid: data?.stop?.callSid || activeCallSid,
        });
        streamActive = false;
        clearPendingVoiceTurn(ws);
        endPlaybackLock(ws, activeCallSid, activeStreamSid, "stream_stop");
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
    endPlaybackLock(ws, activeCallSid, activeStreamSid, "ws_close");
    handleCallEnded(activeCallSid);
  });
}

module.exports = {
  router,
  handleTwilioStream,
  getTwilioDebugState,
};