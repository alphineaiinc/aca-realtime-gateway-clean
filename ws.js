// ws.js - Twilio → Google STT → OpenAI bridge (Story 1.7)

require("dotenv").config();
const speech = require("@google-cloud/speech");
const OpenAI = require("openai");

// Google STT client
const client = new speech.SpeechClient();

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Store transcripts per call (simple memory storage for now)
let callTranscripts = [];

function attachGoogleStream(connection) {
  console.log("🎤 Setting up Google STT stream...");

  const request = {
    config: {
      encoding: "MULAW",          // Twilio sends μ-law PCM
      sampleRateHertz: 8000,      // Twilio default sample rate
      languageCode: "en-US",      // Change if needed
    },
    interimResults: true,
  };

  const recognizeStream = client
    .streamingRecognize(request)
    .on("data", (data) => {
      const transcript = data.results?.[0]?.alternatives?.[0]?.transcript;
      if (transcript) {
        const isFinal = data.results?.[0]?.isFinal;
        console.log(`📝 Transcript${isFinal ? " (final)" : ""}: ${transcript}`);

        callTranscripts.push({
          text: transcript,
          final: isFinal,
          timestamp: Date.now(),
        });

        // Send only final transcripts to AI
        if (isFinal) {
          sendToAI(transcript);
        }
      }
    })
    .on("error", (err) => {
      console.error("Google STT error:", err);
    })
    .on("end", () => {
      console.log("Google stream ended.");
    });

  // Handle Twilio WebSocket messages
  connection.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.event === "media" && data.media?.payload) {
        const audioChunk = Buffer.from(data.media.payload, "base64");
        recognizeStream.write(audioChunk);
      } else if (data.event === "start") {
        console.log("Twilio stream started:", data.start);
      } else if (data.event === "stop") {
        console.log("Twilio stream stopped.");
        recognizeStream.end();
      } else {
        console.log(`ℹ️ Ignored Twilio event: ${data.event}`);
      }
    } catch (e) {
      console.error("WS parse error:", e);
    }
  });

  connection.on("close", () => {
    console.log("❌ WS closed, ending Google stream.");
    recognizeStream.end();
  });

  connection.on("error", (err) => {
    console.error("WebSocket error:", err);
    recognizeStream.end();
  });
}

// --- Helper: send transcript to OpenAI ---
async function sendToAI(text) {
  console.log("🤖 Sending transcript to AI:", text);
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // lightweight, fast model
      messages: [
        { role: "system", content: "You are Alphine ACA, an AI call assistant." },
        { role: "user", content: text },
      ],
    });

    const aiReply = response.choices[0].message.content;
    console.log("🤖 AI Reply:", aiReply);

    // TODO (Story 1.8): Convert aiReply → speech → stream back to Twilio
  } catch (err) {
    console.error("AI error:", err);
  }
}

module.exports = { attachGoogleStream };
