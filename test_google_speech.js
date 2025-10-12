// test_google_speech.js
require("dotenv").config(); // ✅ Load .env file
const fs = require("fs");
const speech = require("@google-cloud/speech");

// ✅ Use env variable for key file
process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

const client = new speech.SpeechClient();

async function main() {
  const filename = "sample.wav";

  if (!fs.existsSync(filename)) {
    console.error("❌ Missing sample.wav. Please place it in project root.");
    process.exit(1);
  }

  const request = {
    config: {
      encoding: "LINEAR16",
      sampleRateHertz: 8000,
      languageCode: "en-US",
    },
    interimResults: false,
  };

  const recognizeStream = client
    .streamingRecognize(request)
    .on("error", (err) => {
      console.error("❌ Speech API Error:", err);
    })
    .on("data", (data) => {
      console.log(
        `✅ Transcript: ${data.results[0].alternatives[0].transcript}`
      );
    });

  fs.createReadStream(filename).pipe(recognizeStream);
}

main().catch(console.error);
