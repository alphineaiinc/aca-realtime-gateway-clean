// test_twilio_chunk.js
require("dotenv").config();
const fs = require("fs");
const speech = require("@google-cloud/speech");

const client = new speech.SpeechClient();

async function testEncoding(encoding) {
  const filename = "twilio_first_chunk.raw";
  if (!fs.existsSync(filename)) {
    console.error(`❌ Missing file: ${filename}. Run a Twilio call first.`);
    return;
  }

  const audioBytes = fs.readFileSync(filename).toString("base64");

  const request = {
    config: {
      encoding: encoding,
      sampleRateHertz: 8000,
      languageCode: "en-US",
    },
    audio: { content: audioBytes },
  };

  try {
    const [response] = await client.recognize(request);
    const transcript = response.results
      .map((r) => r.alternatives[0].transcript)
      .join("\n");
    console.log(`✅ Encoding ${encoding} worked. Transcript: "${transcript}"`);
  } catch (err) {
    console.error(`❌ Encoding ${encoding} failed:`, err.message);
  }
}

async function main() {
  await testEncoding("MULAW");
  await testEncoding("LINEAR16");
}

main();
