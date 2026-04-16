// src/routes/twilio.js
const express = require("express");
const expressWs = require("express-ws"); // ✅ Added to enable router.ws()
const router = express.Router();

// ✅ Patch the router with express-ws before using router.ws()
expressWs(router);

const twilio = require("twilio");
const path = require("path");
const WebSocket = require("ws");
const { retrieveAnswer } = require("../../retriever");
const { synthesizeSpeech } = require("../../tts");
const { getTenantRegion } = require("../brain/utils/tenantContext"); // ✅ tenant region helper
const { transcribeMulaw } = require("../brain/utils/sttGoogle"); // ✅ Google STT helper

// ✅ Tenant voice profile loader (to get language_code for live calls)
let getTenantVoiceProfile = async () => null;
try {
  ({ getTenantVoiceProfile } = require("../brain/utils/voiceProfileLoader"));
} catch (e) {
  console.warn("⚠️ [twilio] voiceProfileLoader not found, using default lang=en-US.");
}

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

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

  if (text.length > 260) {
    text = `${text.slice(0, 257).trim()}...`;
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

  // --- Initial greeting before connection ---
  twiml.say(
    { voice: "Polly.Amy-Neural" },
    "Welcome to Alphine AI. The call orchestration service is active."
  );

  // --- Establish live stream connection to ACA orchestrator ---
  const streamUrl = `${process.env.ALPHINE_STREAM_BASE}/twilio/stream`;
  console.log("🔗 Stream target:", streamUrl);

  const connect = twiml.connect();
  connect.stream({ url: streamUrl });

  // --- Keep call alive while WebSocket is running ---
  // Increase pause duration to give enough buffer time for the stream
  twiml.pause({ length: 15 });

  // --- Return TwiML response ---
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

  // Optional: log or update call record
  if (status === "completed") {
    console.log("✅  Call completed successfully.");
  } else if (status === "failed" || status === "busy") {
    console.log("⚠️  Call ended with status:", status);
  }

  res.sendStatus(200);
}

/**
 * Voice webhook handler — Twilio may hit via GET (test) or POST (normal).
 * Support both to avoid 404s.
 */
router.post("/voice", handleVoiceWebhook);
router.get("/voice", handleVoiceWebhook);

/**
 * Status callback handler — same: support both GET and POST.
 */
router.post("/status", handleStatusWebhook);
router.get("/status", handleStatusWebhook);

/**
 * WebSocket route — Twilio will stream live audio here.
 * Handles real-time bidirectional audio (STT → GPT → TTS).
 */
router.ws("/stream", async (ws, req) => {
  console.log("🌐  Twilio WebSocket connected");

  let activeCallSid = null;
  let activeStreamSid = null; // ✅ track Twilio streamSid for replies
  let lastResponseAt = 0; // ✅ cooldown between TTS replies (ms)
  let streamActive = true; // ✅ avoid sending after stop
  let sttBuffers = []; // ✅ accumulate audio for the next STT chunk

  // ✅ Tenant context for this call
  // For now we assume tenant 1; later this should come from call context / webhook
  let tenantId = 1;
  let tenantLangCode = "en-US"; // default; will try to override from tenant_voice_profile

  /**
   * ✅ Shared final transcript handler for live voice turns
   * Uses shared multi-turn engine first, then falls back safely.
   */
  async function onFinalTranscript(userText) {
    const safeText = String(userText || "").trim();
    if (!safeText) return "";

    const sessionId = `call_${activeCallSid || "unknown"}`;
    const sharedHandler = getSharedConversationHandler();

    if (sharedHandler) {
      let sharedResult = null;
      let sharedError = null;

      // Try object-style call first
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

      // Fallback attempt: text + options style
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

    // ✅ Safe fallback to current ACA voice flow
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

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.event === "start") {
        activeCallSid = data.start.callSid;
        activeStreamSid = data.start.streamSid; // ✅ capture streamSid
        streamActive = true;
        sttBuffers = [];

        console.log("🎬  Stream started:", {
          callSid: activeCallSid,
          streamSid: activeStreamSid,
        });

        // ✅ Resolve tenant language from tenant_voice_profile if available
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
        // Twilio sends base64 μ-law audio in data.media.payload
        const audioBuffer = Buffer.from(data.media.payload, "base64");

        // ✅ Always accumulate audio into current chunk for STT
        sttBuffers.push(audioBuffer);

        // ✅ Simple cooldown: at most one reply every 1 second
        const now = Date.now();
        const COOLDOWN_MS = 1000;
        if (now - lastResponseAt < COOLDOWN_MS) {
          return;
        }
        lastResponseAt = now;

        // ----------------------------------
        // 🔊 STT: convert audio → text
        // ----------------------------------
        let userText = "";
        try {
          const combined = Buffer.concat(sttBuffers);
          sttBuffers = []; // reset for the next utterance

          // ✅ Use tenantLangCode instead of hard-coded en-US
          userText = await transcribeMulaw(combined, {
            languageCode: tenantLangCode,
          });
        } catch (sttErr) {
          console.error(
            "❌ [stt] Transcription failed, falling back to simulated text:",
            sttErr.message
          );
          userText = "simulated transcription";
        }

        if (!userText) {
          console.log("ℹ️ [stt] Empty transcript, skipping reply.");
          return;
        }

        console.log(`👂  Heard (Call ${activeCallSid}):`, userText);

        // ✅ Use shared multi-turn handler with per-call voice session
        const reply = await onFinalTranscript(userText);

        if (!reply) {
          console.log("ℹ️ [twilio] Empty reply after handler, skipping TTS.");
          return;
        }

        console.log("💬  Voice reply:", reply);

        // Resolve tenant region (for accent shaping, etc.)
        let regionCode = null;
        try {
          regionCode = await getTenantRegion(tenantId);
        } catch (e) {
          console.warn(
            `⚠️  Failed to get tenant region for tenant=${tenantId}:`,
            e.message
          );
        }

        // Convert GPT reply to speech using conversational TTS
        let ttsBuffer = null;
        try {
          // ✅ Use tenantLangCode and tenantId so TTS picks up tenant_voice_profile
          ttsBuffer = await synthesizeSpeech(reply, tenantLangCode, {
            tenantId,
            regionCode,
            tonePreset: "friendly",
            useFillers: false, // keep live replies clean; fillers can be enabled later
            outputFormat: "ulaw_8000", // Twilio expects μ-law 8k
            acceptMime: "audio/mpeg",
          });
        } catch (ttsErr) {
          console.error("❌  TTS synthesis failed:", ttsErr.message);
        }

        if (ttsBuffer && activeStreamSid && streamActive) {
          console.log("📡  Sending media back to Twilio:", {
            callSid: activeCallSid,
            streamSid: activeStreamSid,
            bytes: ttsBuffer.length,
          });

          // ✅ Send synthesized speech audio back to Twilio in proper stream protocol
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
        }
      } else if (data.event === "stop") {
        console.log("🛑  Stream stopped for Call SID:", data.stop.callSid);
        streamActive = false;
      }
    } catch (err) {
      console.error("❌  Stream error:", err);
    }
  });

  ws.on("close", () => {
    console.log("⚡  Twilio WebSocket disconnected");
    streamActive = false;
  });
});

module.exports = router;