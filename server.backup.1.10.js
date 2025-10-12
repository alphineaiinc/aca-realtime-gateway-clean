// ================================
// server.js - ACA Realtime Gateway
// Story 1.9: ElevenLabs with direct μ-law output (no SoX needed)
// ================================

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

// Google STT
const speech = require("@google-cloud/speech");
const speechClient = new speech.SpeechClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

// OpenAI
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Express setup
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ---------------------------
// Twilio Voice Webhook → returns TwiML
// ---------------------------
app.post("/twilio/voice", (req, res) => {
  const twiml = `
    <Response>
      <Connect>
        <Stream url="wss://${process.env.NGROK_HOST}/media-stream">
          <Parameter name="secret" value="${process.env.WS_SHARED_SECRET}" />
        </Stream>
      </Connect>
    </Response>
  `;
  console.log("📤 Sending TwiML:", twiml);
  res.type("text/xml");
  res.send(twiml);
});

// ---------------------------
// WebSocket: Twilio ↔ Google STT ↔ OpenAI ↔ ElevenLabs TTS
// ---------------------------
wss.on("connection", (ws) => {
  console.log("🔌 New WebSocket connection from Twilio.");

  let authorized = false;
  let recognizeStream;

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.event === "start") {
      const custom = data.start.customParameters || {};
      ws.streamSid = data.start.streamSid;
      console.log("DEBUG start.customParameters:", custom);

      const incomingSecret = (custom.secret || "").trim();
      const expectedSecret = (process.env.WS_SHARED_SECRET || "").trim();

      if (incomingSecret !== expectedSecret) {
        console.error("❌ Unauthorized WebSocket (bad secret in start event)");
        ws.close();
        return;
      }

      console.log("✅ Authorized Twilio WebSocket via start event.");
      authorized = true;

      const requestConfig = {
        config: {
          encoding: "MULAW",
          sampleRateHertz: 8000,
          languageCode: "en-US",
        },
        interimResults: true,
        singleUtterance: false,
      };

      recognizeStream = speechClient
        .streamingRecognize(requestConfig)
        .on("error", (err) => console.error("Google STT Error:", err))
        .on("data", async (sttData) => {
          const result = sttData.results[0];
          if (!result) return;

          if (result.isFinal) {
            const transcript = result.alternatives[0]?.transcript;
            if (transcript) {
              console.log("📝 Final Transcript:", transcript);

              const aiReply = await generateAIReply(transcript);
              if (aiReply) {
                console.log("🤖 AI Reply:", aiReply);

                const audioBuffer = await speakAIReplyElevenLabs(aiReply);
                if (audioBuffer) {
                  sendAudioToTwilio(ws, audioBuffer);
                }
              }
            }
          } else {
            console.log("⏳ Interim Transcript:", result.alternatives[0]?.transcript);
          }
        });
    }

    else if (data.event === "media" && authorized && data.media?.payload) {
      const audio = Buffer.from(data.media.payload, "base64");
      recognizeStream?.write(audio);
    }

    else if (data.event === "stop") {
      console.log("🛑 Twilio stream stopped.");
      recognizeStream?.destroy();
    }
  });

  ws.on("close", () => {
    console.log("🔌 Twilio WebSocket disconnected.");
    recognizeStream?.destroy();
  });
});

// ---------------------------
// Helper: OpenAI Reply Generator
// ---------------------------
async function generateAIReply(transcript) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an AI call assistant for a business." },
        { role: "user", content: transcript },
      ],
    });
    return completion.choices[0].message.content;
  } catch (err) {
    if (err.code === "rate_limit_exceeded") {
      console.warn("⚠️ OpenAI rate limit hit. Returning fallback reply.");
      return "I'm currently handling too many requests, please try again shortly.";
    }
    console.error("OpenAI Error:", err);
    return null;
  }
}

// ---------------------------
// Helper: ElevenLabs TTS (direct μ-law output)
// ---------------------------
async function speakAIReplyElevenLabs(text) {
  try {
    const voiceId = "EXAVITQu4vr4xnSDxMaL"; // replace with your chosen voice
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=ulaw_8000`;

    const response = await axios.post(
      url,
      { text },
      {
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      }
    );

    return Buffer.from(response.data);
  } catch (err) {
    console.error("ElevenLabs TTS Error:", err.response?.data || err.message);
    return null;
  }
}

// ---------------------------
// Helper: Send audio chunks to Twilio WebSocket
// ---------------------------
function sendAudioToTwilio(ws, audioBuffer) {
  if (!ws.streamSid) {
    console.error("❌ No streamSid found, cannot send outbound audio.");
    return;
  }

  const base64Chunk = audioBuffer.toString("base64");
  const message = {
    event: "media",
    streamSid: ws.streamSid,
    media: {
      track: "outbound",
      payload: base64Chunk,
    },
  };
  ws.send(JSON.stringify(message));
  console.log("🔊 Sent AI voice reply to caller.");
}

// ---------------------------
// Start server
// ---------------------------
const PORT = process.env.APP_PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 NGROK_HOST from .env: ${process.env.NGROK_HOST}`);
});
