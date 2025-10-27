// ===============================================
// tts.js — Alphine AI Text-to-Speech Handler
// Story 9.3 / 10.3 Integration
// ===============================================
const axios = require("axios");
const fs = require("fs");

// --- Default voice mapping (per language code)
const voiceMap = {
  "en-US": "21m00Tcm4TlvDq8ikWAM", // ElevenLabs default "Rachel"
  "ta-IN": "TxGEqnHWrfWFTfGW9XjX", // Tamil - placeholder ID
  "fr-FR": "EXAVITQu4vr4xnSDxMaL", // French - "Antoine"
  "es-ES": "pNInz6obpgDQGcFmaJgB", // Spanish
  "hi-IN": "MF3mGyEYCl7XYWbV9V6O"  // Hindi
};

// --- Default fallback voice ID (Rachel)
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

async function synthesizeSpeech(text, langCode = "en-US") {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY in .env");

    // Pick mapped voice or fallback
    const voiceId = voiceMap[langCode] || DEFAULT_VOICE_ID;
    const voiceLang = (langCode.split("-")[0] || "en").toLowerCase();

    console.log(`🎙 [tts] Selected voiceId=${voiceId || "MISSING"} for langCode=${langCode}`);

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    console.log("📤 [tts] API Request:", {
      url,
      model_id: "eleven_multilingual_v2",
      language_code: voiceLang,
      text_preview: text.substring(0, 80) + "..."
    });

    const response = await axios.post(
      url,
      {
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.4, similarity_boost: 0.8 },
      },
      {
        headers: {
          "xi-api-key": apiKey,
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      }
    );

    console.log("✅ [tts] ElevenLabs synthesis complete");
    return Buffer.from(response.data);
  } catch (err) {
    console.error("❌ [tts] ElevenLabs error:", err.response?.data || err.message);
    throw new Error("ElevenLabs TTS failed: " + (err.response?.statusText || err.message));
  }
}

module.exports = { synthesizeSpeech };
