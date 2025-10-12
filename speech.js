// speech.js
const speech = require("@google-cloud/speech");
const client = new speech.SpeechClient();

function startStreamingRecognition(ws) {
  let recognizeStream = null;
  let configSent = false;

  ws.on("message", (msg) => {
    let parsed;
    try {
      parsed = JSON.parse(msg.toString());
    } catch {
      console.log("⚠️ Non-JSON message, ignoring.");
      return;
    }

    if (parsed.event === "start") {
      console.log("ℹ️ Twilio media stream started.");

      recognizeStream = client
        .streamingRecognize()
        .on("error", (err) => {
          console.error("❌ Speech API Error:", err.message);
        })
        .on("data", (data) => {
          const transcript = data.results[0]?.alternatives[0]?.transcript;
          if (transcript) {
            const isFinal = data.results[0].isFinal;
            console.log(
              isFinal
                ? `✅ Final Transcript: ${transcript}`
                : `📝 Partial Transcript: ${transcript}`
            );
          }
        });

      // ✅ First message must be streamingConfig
      recognizeStream.write({
        streamingConfig: {
          config: {
            encoding: "MULAW", // Twilio default
            sampleRateHertz: 8000,
            languageCode: "en-US",
          },
          interimResults: true,
          singleUtterance: false,
        },
      });

      configSent = true;
      console.log("📤 Config sent to Google");
    }

    if (parsed.event === "media" && parsed.media?.payload) {
      const audioChunk = Buffer.from(parsed.media.payload, "base64");
      if (configSent && recognizeStream?.writable) {
        recognizeStream.write({ audioContent: audioChunk });
        console.log("🎤 Forwarding chunk (bytes):", audioChunk.length);
      } else {
        console.log("⚠️ Dropping audio — config not sent yet.");
      }
    }

    if (parsed.event === "stop") {
      console.log("ℹ️ Twilio media stream stopped.");
      if (recognizeStream?.writable) recognizeStream.end();
      configSent = false;
    }
  });

  ws.on("close", () => {
    console.log("🔒 WebSocket closed by Twilio.");
    if (recognizeStream?.writable) recognizeStream.end();
    configSent = false;
  });
}

module.exports = startStreamingRecognition;
