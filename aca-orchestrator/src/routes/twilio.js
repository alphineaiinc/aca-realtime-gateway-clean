// src/routes/twilio.js
const express = require("express");
const router = express.Router();
const twilio = require("twilio");
const path = require("path");
const WebSocket = require("ws");
const { retrieveAnswer } = require("../../retriever");
const { synthesizeSpeech } = require("../../tts");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

/**
 * Voice webhook handler — called when a call starts.
 * Establishes live Twilio <Connect><Stream> to ACA orchestrator.
 */
router.post("/voice", (req, res) => {
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

});

/**
 * Status callback handler — called when Twilio reports call progress.
 */
router.post("/status", (req, res) => {
  const status = req.body?.CallStatus || "unknown";
  console.log("📡  Twilio Status update:", status);

  // Optional: log or update call record
  if (status === "completed") {
    console.log("✅  Call completed successfully.");
  } else if (status === "failed" || status === "busy") {
    console.log("⚠️  Call ended with status:", status);
  }

  res.sendStatus(200);
});

/**
 * WebSocket route — Twilio will stream live audio here.
 * Handles real-time bidirectional audio (STT → GPT → TTS).
 */
router.ws("/stream", async (ws, req) => {
  console.log("🌐  Twilio WebSocket connected");

  let activeCallSid = null;

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.event === "start") {
        activeCallSid = data.start.callSid;
        console.log("🎬  Stream started for Call SID:", activeCallSid);
      }

      else if (data.event === "media" && data.media.payload) {
        // Twilio sends base64 PCM16 audio in data.media.payload
        const audioBuffer = Buffer.from(data.media.payload, "base64");

        // TODO: Replace with real-time STT engine (e.g., Google or Whisper)
        // For now, simulate recognition for debugging
        const simulatedText = "simulated transcription";

        if (simulatedText) {
          console.log(`👂  Heard (Call ${activeCallSid}):`, simulatedText);

          // Retrieve GPT-generated response
          const reply = await retrieveAnswer(1, simulatedText);
          console.log("💬  GPT reply:", reply);

          // Convert GPT reply to speech
          const ttsBuffer = await synthesizeSpeech(reply);

          // Send synthesized speech audio back to Twilio (base64)
          ws.send(JSON.stringify({
            event: "speech",
            audio: ttsBuffer.toString("base64")
          }));
        }
      }

      else if (data.event === "stop") {
        console.log("🛑  Stream stopped for Call SID:", data.stop.callSid);
      }
    } catch (err) {
      console.error("❌  Stream error:", err);
    }
  });

  ws.on("close", () => {
    console.log("⚡  Twilio WebSocket disconnected");
  });
});

module.exports = router;
