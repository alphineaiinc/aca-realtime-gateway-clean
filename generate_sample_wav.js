// generate_sample_wav.js
// Generates a simple 8kHz PCM WAV file saying nothing (just silence + a beep).
// This is just to validate Google Speech client, not real speech.

const fs = require("fs");

function generateWavFile(filename) {
  const sampleRate = 8000;
  const durationSeconds = 2;
  const numSamples = sampleRate * durationSeconds;

  // Generate a simple sine wave (440Hz beep) for testing
  const frequency = 440;
  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = Math.round(
      32767 * Math.sin((2 * Math.PI * frequency * i) / sampleRate)
    );
  }

  // WAV file header
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); // ChunkID
  header.writeUInt32LE(36 + samples.length * 2, 4); // ChunkSize
  header.write("WAVE", 8); // Format
  header.write("fmt ", 12); // Subchunk1ID
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20); // AudioFormat (PCM)
  header.writeUInt16LE(1, 22); // NumChannels
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  header.writeUInt16LE(2, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write("data", 36); // Subchunk2ID
  header.writeUInt32LE(samples.length * 2, 40); // Subchunk2Size

  const pcmData = Buffer.from(samples.buffer);
  const wav = Buffer.concat([header, pcmData]);

  fs.writeFileSync(filename, wav);
  console.log(`✅ Generated WAV file: ${filename}`);
}

generateWavFile("sample.wav");
