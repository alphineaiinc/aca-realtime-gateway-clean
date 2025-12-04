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
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

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
      } else if (data.event === "media" && data.media.payload) {
        // Twilio sends base64 PCM16 μ-law audio in data.media.payload
        const audioBuffer = Buffer.from(data.media.payload, "base64");

        // ✅ Always accumulate audio into current chunk for STT
        sttBuffers.push(audioBuffer);

        // ✅ Simple cooldown: at most one reply every 5 seconds
        const now = Date.now();
        const COOLDOWN_MS = 1500;
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
          userText = await transcribeMulaw(combined, { languageCode: "en-US" });
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

        // For now we assume tenant 1; later this should come from call context / webhook
        const tenantId = 1;

        // ✅ Retrieve GPT-generated response with per-call session (activeCallSid)
        const reply = await retrieveAnswer(userText, tenantId, "en-US", activeCallSid);
        console.log("💬  GPT reply:", reply);
        console.log("💬 [conv]", {
          callSid: activeCallSid,
          user: userText,
          bot: reply,
        });

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
          // For now we assume English; later this can be detected dynamically
          const langCode = "en-US";
          ttsBuffer = await synthesizeSpeech(reply, langCode, {
            tenantId,
            regionCode,
            tonePreset: "friendly",
            useFillers: true,
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
