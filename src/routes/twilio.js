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

const VOICE_TURN_SILENCE_MS = Number(process.env.VOICE_TURN_SILENCE_MS || 1200);
const VOICE_MIN_UTTERANCE_CHARS = Number(process.env.VOICE_MIN_UTTERANCE_CHARS || 3);
const VOICE_MAX_REPLY_CHARS = Number(process.env.VOICE_MAX_REPLY_CHARS || 220);
const VOICE_LOG_PREFIX = "[twilio_voice_intel]";

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
      ttsBuffer = await synthesizeSpeech(shapedReply, tenantLangCode, {
        tenantId,
        regionCode,
        tonePreset: "friendly",
        useFillers: false,
        outputFormat: "ulaw_8000",
        acceptMime: "audio/mpeg",
      });
    } catch (ttsErr) {
      console.error("❌  TTS synthesis failed:", ttsErr.message);
      pushTwilioDebug("tts_error", {
        callSid: activeCallSid,
        error: ttsErr.message,
      });
    }

    if (ttsBuffer && activeStreamSid && streamActive) {
      console.log("📡  Sending media back to Twilio:", {
        callSid: activeCallSid,
        streamSid: activeStreamSid,
        bytes: ttsBuffer.length,
      });
      pushTwilioDebug("tts_send", {
        callSid: activeCallSid,
        streamSid: activeStreamSid,
        bytes: ttsBuffer.length,
      });
      console.log("📤 [twilio] Sending WS media event back to Twilio");

      ws.send(
        JSON.stringify({
          event: "media",
          streamSid: activeStreamSid,
          media: {
            payload: ttsBuffer.toString("base64"),
          },
        })
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

        console.log("🎬  Stream started:", {
          callSid: activeCallSid,
          streamSid: activeStreamSid,
        });

        // test-only ack for manual WS probes
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

        // Throttle media debug so it does not flood the ring buffer
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

        // Force fallback if text is empty or too small to be useful
        if (!cleanedText || cleanedText.length < 2) {
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
            ttsBuffer = await synthesizeSpeech(fallbackReply, tenantLangCode, {
              tenantId,
              tonePreset: "friendly",
              useFillers: false,
              outputFormat: "ulaw_8000",
              acceptMime: "audio/mpeg",
            });
          } catch (ttsErr) {
            console.error("❌ [twilio] Fallback TTS failed:", ttsErr.message);
            pushTwilioDebug("tts_fallback_error", {
              callSid: activeCallSid,
              error: ttsErr.message,
            });
          }

          if (ttsBuffer && activeStreamSid && streamActive) {
            pushTwilioDebug("tts_send_forced", {
              callSid: activeCallSid,
              streamSid: activeStreamSid,
              bytes: ttsBuffer.length,
            });

            console.log("📤 [twilio] Sending forced fallback audio");

            ws.send(
              JSON.stringify({
                event: "media",
                streamSid: activeStreamSid,
                media: {
                  payload: ttsBuffer.toString("base64"),
                },
              })
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
              ttsBuffer = await synthesizeSpeech(fallbackReply, tenantLangCode, {
                tenantId,
                tonePreset: "friendly",
                useFillers: false,
                outputFormat: "ulaw_8000",
                acceptMime: "audio/mpeg",
              });
            } catch (ttsErr) {
              console.error("❌  Fallback TTS synthesis failed:", ttsErr.message);
              pushTwilioDebug("tts_fallback_error", {
                callSid: activeCallSid,
                error: ttsErr.message,
              });
            }

            if (ttsBuffer && activeStreamSid && streamActive) {
              pushTwilioDebug("tts_send", {
                callSid: activeCallSid,
                streamSid: activeStreamSid,
                bytes: ttsBuffer.length,
              });
              console.log("📤 [twilio] Sending WS media event back to Twilio");

              ws.send(
                JSON.stringify({
                  event: "media",
                  streamSid: activeStreamSid,
                  media: {
                    payload: ttsBuffer.toString("base64"),
                  },
                })
              );
            }
          }
        }, VOICE_TURN_SILENCE_MS);
      } else if (data.event === "stop") {
        console.log("🛑  Stream stopped for Call SID:", data.stop.callSid);
        pushTwilioDebug("stop", {
          callSid: data?.stop?.callSid || activeCallSid,
        });
        streamActive = false;
        clearPendingVoiceTurn(ws);
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
  });
}

module.exports = {
  router,
  handleTwilioStream,
  getTwilioDebugState,
};