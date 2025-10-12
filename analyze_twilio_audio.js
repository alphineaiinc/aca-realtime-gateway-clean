// analyze_twilio_audio.js
// Reads the first Twilio raw chunk, wraps in WAV, and tests against Google Speech with multiple configs.

require("dotenv").config();
const fs = require("fs");
const speech = require("@google-cloud/speech");

const client = new speech.SpeechClient();

function writeWav(filename, rawBuffer, sampleRate = 8000) {
  const header = Buffer.alloc(44);
  const dataLength = rawBuffer.length;
  const byteRate = sampleRate * 2; // 16-bit PCM mono
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(1, 22); // NumChannels
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(byteRate, 28); // ByteRate
  header.writeUInt16LE(2, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  fs.writeFileSync(filename, Buffer.concat([header, rawBuffer]));
  console.log(`💾 Wrote ${filename} (${sampleRate}Hz, ${dataLength} bytes)`);
}

async function testEncoding(encoding, rate) {
  const rawFile = "twilio_first_chunk.raw";
  if (!fs.existsSync(rawFile)) {
    console.error("❌ Missing twilio_first_chunk.raw. Run a Twilio call first.");
    return;
  }

  const audioBytes = fs.readFileSync(rawFile).toString("base64");

  const request = {
    config: {
      encoding: encoding,
      sampleRateHertz: rate,
      languageCode: "en-US",
    },
    audio: { content: audioBytes },
  };

  try {
    const [response] = await client.recognize(request);
    const transcript = response.results
      .map((r) => r.alternatives[0].transcript)
      .join("\n");
    console.log(`✅ ${encoding}@${rate}Hz worked. Transcript: "${transcript}"`);
  } catch (err) {
    console.error(`❌ ${encoding}@${rate}Hz failed:`, err.message);
  }
}

async function main() {
  const rawBuffer = fs.readFileSync("twilio_first_chunk.raw");

  // Also dump WAV for inspection
  writeWav("twilio_first_chunk.wav", rawBuffer, 8000);

  // Try multiple configs
  await testEncoding("MULAW", 8000);
  await testEncoding("LINEAR16", 8000);
  await testEncoding("MULAW", 16000);
  await testEncoding("LINEAR16", 16000);
}

main().catch(console.error);
