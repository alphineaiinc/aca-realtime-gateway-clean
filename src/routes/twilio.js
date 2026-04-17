// src/routes/twilio.js
const express = require("express");
const router = express.Router();

const twilio = require("twilio");
const path = require("path");
const WebSocket = require("ws");
const { retrieveAnswer } = require("../../retriever");
const { synthesizeSpeech } = require("../../tts");
const { getTenantRegion } = require("../brain/utils/tenantContext"); // ✅ tenant region helper
const { transcribeMulaw } = require("../brain/utils/sttGoogle"); // ✅ Google STT helper

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

console.log("🧩 [twilio->tts] resolved module:", require.resolve("../../tts"));
console.log("🧩 [twilio->tts] typeof synthesizeSpeech:", typeof synthesizeSpeech);

const VOICE_TURN_SILENCE_MS = Number(process.env.VOICE_TURN_SILENCE_MS || 1200);
const VOICE_MIN_UTTERANCE_CHARS = Number(process.env.VOICE_MIN_UTTERANCE_CHARS || 3);
const VOICE_MAX_REPLY_CHARS = Number(process.env.VOICE_MAX_REPLY_CHARS || 220);
const VOICE_LOG_PREFIX = "[twilio_voice_intel]";

// ✅ Loop protection / playback gating
const VOICE_PLAYBACK_TAIL_MS = Number(process.env.VOICE_PLAYBACK_TAIL_MS || 700);
const VOICE_PLAYBACK_PADDING_MS = Number(process.env.VOICE_PLAYBACK_PADDING_MS || 250);
const TWILIO_MULAW_BYTES_PER_SEC = 8000; // μ-law 8k => ~8000 bytes/sec

// ✅ Tenant voice profile loader (to get language_code for live calls)
let getTenantVoiceProfile = async () => null;
try {
  ({ getTenantVoiceProfile } = require("../brain/utils/voiceProfileLoader"));
} catch (e) {
  console.warn("⚠️ [twilio] voiceProfileLoader not found, using default lang=en-US.");
}

/**
 * Story 13.1.9 — Durable Twilio debug snapshot
 */
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

function beginPlaybackLock(ws, ttsBuffer, activeCallSid, activeStreamSid, branch = "main") {
  if (!ws) return;

  const holdMs = estimatePlaybackMs(ttsBuffer);
  ws.__isSpeaking = true;
  ws.__speakUntil = Date.now() + holdMs;

  const playback = ensurePlaybackState(ws);
  playback.active = true;
  playback.lastMediaSentAt = Date.now();
  playback.ignoreInboundUntil = Date.now() + 1500;

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

  beginPlaybackLock(ws, ttsBuffer, activeCallSid, activeStreamSid, branch);

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
 * ✅ Lazy-load shared conversation handler from root index.js
 * Avoid top-level require to reduce circular import risk.
 */
function getSharedConversationHandler() {
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

/**
 * ✅ Keep voice replies short and natural for live calls
 */
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

/**
 * Shared handler for Twilio voice webhook
 */
async function handleVoiceWebhook(req, res) {
  console.log("🛰️  Incoming Twilio Voice webhook:", req.body);

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  twiml.say(
    { voice: "Polly.Amy-Neural" },
    "Welcome to Alphine AI. The call orchestration service is active."
  );

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

/**
 * Shared handler for Twilio status callback
 */
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

/**
 * App-level WebSocket handler for /ws/twilio-stream
 */
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
  ensurePlaybackState(ws);

  async function onFinalTranscript(userText) {
    const safeText = normalizeIncomingVoiceText(userText);
    if (!safeText) return "";

    const sessionId = `call_${activeCallSid || "unknown"}`;
    const sharedHandler = getSharedConversationHandler();

    if (sharedHandler) {
      let sharedResult = null;
      let sharedError = null;

      try {
        sharedResult = await sharedHandler({
          message: safeText,
          userText: safeText,
          tenantId,
          locale: tenantLangCode,
          sessionId,
          channel: "voice",
          source: "twilio",
          shortReply: true,
        });
      } catch (err) {
        sharedError = err;
      }

      if (!sharedResult) {
        try {
          sharedResult = await sharedHandler(safeText, {
            tenantId,
            locale: tenantLangCode,
            sessionId,
            channel: "voice",
            source: "twilio",
            shortReply: true,
          });
          sharedError = null;
        } catch (err) {
          sharedError = err;
        }
      }

      const normalizedSharedReply = normalizeVoiceReply(sharedResult);
      if (normalizedSharedReply) {
        console.log("🧠 [twilio] Shared conversation handler reply:", {
          callSid: activeCallSid,
          sessionId,
          user: safeText,
          bot: normalizedSharedReply,
        });
        return normalizedSharedReply;
      }

      if (sharedError) {
        console.warn(
          "⚠️ [twilio] Shared handler failed, using retrieveAnswer fallback:",
          sharedError.message
        );
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

    const reply = await onFinalTranscript(finalVoiceText);

    if (!reply) {
      console.log("ℹ️ [twilio] Empty reply after handler, skipping TTS.");
      pushTwilioDebug("reply_empty", {
        callSid: activeCallSid,
      });
      return;
    }

    const shapedReply = normalizeVoiceReply(reply);

    console.log(
      `${VOICE_LOG_PREFIX} reply_ready`,
      JSON.stringify({
        callSid: activeCallSid,
        chars: shapedReply.length,
        completed: looksTaskCompleted(shapedReply),
      })
    );
    pushTwilioDebug("reply_ready", {
      callSid: activeCallSid,
      chars: shapedReply.length,
      completed: looksTaskCompleted(shapedReply),
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
      });
    } catch (ttsErr) {
      console.error("❌  TTS synthesis failed:", ttsErr.message);
      pushTwilioDebug("tts_error", {
        callSid: activeCallSid,
        error: ttsErr.message,
      });
    }

    if (ttsBuffer && activeStreamSid && streamActive) {
      sendTwilioAudioWithMark(
        ws,
        activeCallSid,
        activeStreamSid,
        ttsBuffer,
        "main"
      );
    } else if (!activeStreamSid) {
      console.warn(
        "⚠️  Skipping TTS send: activeStreamSid is missing, cannot send media event."
      );
      pushTwilioDebug("tts_skip_no_streamsid", {
        callSid: activeCallSid,
      });
    }
  }

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("📥 [twilio] WS event:", data?.event || "(unknown)");

      if (data.event === "start") {
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

        const playback = ensurePlaybackState(ws);
        playback.active = false;
        playback.currentMark = null;
        playback.ignoreInboundUntil = 0;
        playback.lastMediaSentAt = 0;

        console.log("🎬  Stream started:", {
          callSid: activeCallSid,
          streamSid: activeStreamSid,
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

        // ✅ Ignore caller STT while ACA audio is playing / mark is pending / tail cooldown is active
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
        const COOLDOWN_MS = 1000;
        if (now - lastResponseAt < COOLDOWN_MS) {
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

          pushTwilioDebug("stt_return", {
            callSid: activeCallSid,
            text: String(userText || "").slice(0, 120),
            length: String(userText || "").length,
          });
        } catch (sttErr) {
          console.error(
            "❌ [stt] Transcription failed, falling back to simulated text:",
            sttErr.message
          );
          pushTwilioDebug("stt_error", {
            callSid: activeCallSid,
            error: sttErr.message,
          });
          userText = "simulated transcription";
        }

        userText = normalizeIncomingVoiceText(userText);
        const cleanedText = normalizeIncomingVoiceText(userText);

        if (!cleanedText || cleanedText.length < 2) {
          if (isPlaybackLocked(ws)) {
            console.log("⏸️ [stt] Empty transcript ignored during ACA playback", {
              callSid: activeCallSid,
              streamSid: activeStreamSid,
            });
            pushTwilioDebug("stt_invalid_ignored_playback", {
              callSid: activeCallSid,
              streamSid: activeStreamSid,
            });
            return;
          }

          console.log("ℹ️ [stt] Invalid or empty transcript — forcing fallback");

          pushTwilioDebug("stt_invalid_forced", {
            callSid: activeCallSid,
            raw: userText,
            cleaned: cleanedText,
          });

          const fallbackReply =
            "Hello, I can hear you clearly. Please say your request, for example, book a table or schedule an appointment.";

          let ttsBuffer = null;
          try {
            console.log("🗣️ [twilio] about to call synthesizeSpeech", {
              callSid: activeCallSid,
              streamSid: activeStreamSid,
              replyPreview: String(fallbackReply || "").slice(0, 120),
              hasReply: !!fallbackReply,
              langCode: tenantLangCode,
              tenantId,
              path: "../../tts",
              branch: "forced_fallback_invalid_stt",
            });

            ttsBuffer = await synthesizeSpeech(fallbackReply, tenantLangCode, {
              tenantId,
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
              branch: "forced_fallback_invalid_stt",
            });
          } catch (ttsErr) {
            console.error("❌ [twilio] Fallback TTS failed:", ttsErr.message);
            pushTwilioDebug("tts_fallback_error", {
              callSid: activeCallSid,
              error: ttsErr.message,
            });
          }

          if (ttsBuffer && activeStreamSid && streamActive) {
            sendTwilioAudioWithMark(
              ws,
              activeCallSid,
              activeStreamSid,
              ttsBuffer,
              "forced_fallback_invalid_stt"
            );
          }

          return;
        }

        console.log(`👂  Heard (Call ${activeCallSid}):`, userText);

        if (ws.__pendingVoiceTranscript) {
          ws.__pendingVoiceTranscript = `${ws.__pendingVoiceTranscript} ${userText}`.trim();
        } else {
          ws.__pendingVoiceTranscript = userText;
        }

        ws.__lastVoiceInputAt = Date.now();

        clearPendingVoiceTurn(ws);

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

            const fallbackReply =
              "Sorry, I didn't catch that. Please say that once more.";

            let ttsBuffer = null;
            try {
              console.log("🗣️ [twilio] about to call synthesizeSpeech", {
                callSid: activeCallSid,
                streamSid: activeStreamSid,
                replyPreview: String(fallbackReply || "").slice(0, 120),
                hasReply: !!fallbackReply,
                langCode: tenantLangCode,
                tenantId,
                path: "../../tts",
                branch: "dispatch_error_fallback",
              });

              ttsBuffer = await synthesizeSpeech(fallbackReply, tenantLangCode, {
                tenantId,
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
                branch: "dispatch_error_fallback",
              });
            } catch (ttsErr) {
              console.error("❌  Fallback TTS synthesis failed:", ttsErr.message);
              pushTwilioDebug("tts_fallback_error", {
                callSid: activeCallSid,
                error: ttsErr.message,
              });
            }

            if (ttsBuffer && activeStreamSid && streamActive) {
              sendTwilioAudioWithMark(
                ws,
                activeCallSid,
                activeStreamSid,
                ttsBuffer,
                "dispatch_error_fallback"
              );
            }
          }
        }, VOICE_TURN_SILENCE_MS);
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
        }
      } else if (data.event === "stop") {
        console.log("🛑  Stream stopped for Call SID:", data.stop.callSid);
        pushTwilioDebug("stop", {
          callSid: data?.stop?.callSid || activeCallSid,
        });
        streamActive = false;
        clearPendingVoiceTurn(ws);
        endPlaybackLock(ws, activeCallSid, activeStreamSid, "stream_stop");
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
  });
}

module.exports = {
  router,
  handleTwilioStream,
  getTwilioDebugState,
};