// src/brain/utils/sttGoogle.js
// Simple Google Cloud Speech-to-Text helper for Twilio Media Streams (μ-law 8k)

const speech = require("@google-cloud/speech");

let cachedClient = null;

function getSpeechClient() {
  if (cachedClient) return cachedClient;

  const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;

  console.log("🔧 [stt] Env check:", {
    hasJson: !!credJson,
    hasProjectId: !!projectId,
  });

  if (credJson && projectId) {
    try {
      const credentials = JSON.parse(credJson);
      cachedClient = new speech.SpeechClient({
        projectId,
        credentials,
      });
      console.log(
        "✅ [stt] Google STT client initialized with explicit credentials."
      );
      return cachedClient;
    } catch (e) {
      console.error(
        "❌ [stt] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON, falling back to default credentials:",
        e.message
      );
    }
  } else {
    console.warn(
      "⚠️ [stt] GOOGLE_APPLICATION_CREDENTIALS_JSON or GOOGLE_CLOUD_PROJECT_ID missing, using default credentials."
    );
  }

  // Fallback: default credentials (will fail on Render until configured)
  cachedClient = new speech.SpeechClient();
  return cachedClient;
}

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

  const client = getSpeechClient();

  const audio = {
    content: audioBuffer.toString("base64"),
  };

const config = {
  encoding: "MULAW",
  sampleRateHertz: 8000,
  languageCode,
  enableAutomaticPunctuation: false,
  model: "phone_call",
  useEnhanced: true,
  profanityFilter: false,
  maxAlternatives: 1,
  metadata: {
    interactionType: "PHONE_CALL",
    microphoneDistance: "TELEPHONY",
    originalMediaType: "AUDIO",
  },
};

  let response;

try {
  [response] = await client.recognize({ audio, config });
} catch (err) {
  console.warn("⚠️ [stt] phone_call config failed, retrying with default model:", err.message);

  const fallbackConfig = {
    encoding: "MULAW",
    sampleRateHertz: 8000,
    languageCode,
    enableAutomaticPunctuation: false,
    model: "default",
    maxAlternatives: 1,
  };

  [response] = await client.recognize({ audio, config: fallbackConfig });
}

  const transcript = (response.results || [])
    .map(
      (r) =>
        (r.alternatives &&
          r.alternatives[0] &&
          r.alternatives[0].transcript) ||
        ""
    )
    .join(" ")
    .trim();

  return transcript;
}

module.exports = { transcribeMulaw };
