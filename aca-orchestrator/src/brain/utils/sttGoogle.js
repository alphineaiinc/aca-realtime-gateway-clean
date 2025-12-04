// src/brain/utils/sttGoogle.js
// Simple Google Cloud Speech-to-Text helper for Twilio Media Streams (μ-law 8k)

const speech = require("@google-cloud/speech");

// Uses GOOGLE_APPLICATION_CREDENTIALS env var for auth
const client = new speech.SpeechClient();

/**
 * Transcribe a single chunk of Twilio μ-law 8k audio.
 *
 * @param {Buffer} audioBuffer - Raw μ-law 8k mono audio from Twilio
 * @param {object} opts
 * @param {string} opts.languageCode - BCP-47 code, e.g., "en-US"
 * @returns {Promise<string>} transcript text (may be empty string)
 */
async function transcribeMulaw(audioBuffer, { languageCode = "en-US" } = {}) {
  if (!audioBuffer || !audioBuffer.length) {
    return "";
  }

  const audio = {
    content: audioBuffer.toString("base64"),
  };

  const config = {
    encoding: "MULAW",
    sampleRateHertz: 8000,
    languageCode,
    // You can tune these later if needed:
    enableAutomaticPunctuation: true,
    model: "default",
  };

  const [response] = await client.recognize({ audio, config });

  const transcript = (response.results || [])
    .map((r) => (r.alternatives && r.alternatives[0] && r.alternatives[0].transcript) || "")
    .join(" ")
    .trim();

  return transcript;
}

module.exports = { transcribeMulaw };
