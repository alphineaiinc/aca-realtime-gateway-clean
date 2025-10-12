// tts.js – ElevenLabs TTS integration with debug logs
const fetch = require("node-fetch");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// Pick correct voice ID based on language
function getVoiceForLang(langCode) {
  let voiceId;
  switch (langCode) {
    case "ta-IN":
      voiceId = process.env.ELEVENLABS_VOICE_TA;
      break;
    case "hi-IN":
      voiceId = process.env.ELEVENLABS_VOICE_HI;
      break;
    case "es-ES":
      voiceId = process.env.ELEVENLABS_VOICE_ES;
      break;
    default:
      voiceId = process.env.ELEVENLABS_VOICE_EN;
      break;
  }
  console.log(`🎙 [tts] Selected voiceId=${voiceId || "MISSING"} for langCode=${langCode}`);
  return voiceId;
}

async function synthesizeSpeech(text, langCode) {
  const voiceId = getVoiceForLang(langCode);
  const modelId = process.env.ELEVEN_MODEL_ID || "eleven_multilingual_v2"; // safest default

  // Prepare request body
  const body = {
    text,
    model_id: modelId,
    language_code: langCode.split("-")[0], // e.g. "ta" from "ta-IN"
    voice_settings: { stability: 0.7, similarity_boost: 0.7 }
  };

  // Debug log
  console.log("📤 [tts] API Request:", {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    model_id: modelId,
    language_code: body.language_code,
    text_preview: text.slice(0, 60) + (text.length > 60 ? "..." : "")
  });

  // Make API call
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ [tts] ElevenLabs error:", response.status, errorText);
    throw new Error(`ElevenLabs TTS failed: ${response.status} ${response.statusText}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  console.log("✅ [tts] Received audio buffer length:", audioBuffer.length);
  return audioBuffer;
}

module.exports = { synthesizeSpeech };
