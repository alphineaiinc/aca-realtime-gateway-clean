// ===============================================
// tts.js — Alphine AI Text-to-Speech Handler
// Story 9.3 / 10.3 Integration + 9.X Conversational Layer
// ===============================================
const axios = require("axios");
const fs = require("fs");

// ------------------------------------------------------
// Optional conversational helpers (prosody / fillers / accent)
// If these files are not present yet, we fall back to no-op
// so TTS continues to work without breaking.
// ------------------------------------------------------
let applyProsody = (text, _opts) => text;
let injectFillers = (text, _opts) => text;
let applyAccentShaping = (text, _opts) => text;

try {
  ({ applyProsody } = require("./src/brain/utils/prosodyEngine"));
} catch (e) {
  console.warn("⚠️ [tts] prosodyEngine not found, using passthrough.");
}

try {
  ({ injectFillers } = require("./src/brain/utils/fillers"));
} catch (e) {
  console.warn("⚠️ [tts] fillers not found, using passthrough.");
}

try {
  ({ applyAccentShaping } = require("./src/brain/utils/accentShaper"));
} catch (e) {
  console.warn("⚠️ [tts] accentShaper not found, using passthrough.");
}

// Tenant voice profile loader
let getTenantVoiceProfile = async () => null;
try {
  ({ getTenantVoiceProfile } = require("./src/brain/utils/voiceProfileLoader"));
} catch (e) {
  console.warn("⚠️ [tts] voiceProfileLoader not found, tenant profiles disabled.");
}

// --- Default voice mapping (per language code)
const voiceMap = {
  "en-US": "21m00Tcm4TlvDq8ikWAM", // ElevenLabs default "Rachel"
  "ta-IN": "TxGEqnHWrfWFTfGW9XjX", // Tamil - placeholder ID
  "fr-FR": "EXAVITQu4vr4xnSDxMaL", // French - "Antoine"
  "es-ES": "pNInz6obpgDQGcFmaJgB", // Spanish
  "hi-IN": "MF3mGyEYCl7XYWbV9V6O", // Hindi
};

// --- Default fallback voice ID (Rachel)
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/**
 * synthesizeSpeech
 *
 * @param {string} text      Raw text from GPT / ACA brain
 * @param {string} langCode  BCP-47 lang code like "en-US", "ta-IN"
 * @param {object} options   Optional conversational controls:
 *   - tenantId       (for tenant-specific voice profile)
 *   - regionCode     (e.g. "IN", "FR", "CA")
 *   - tonePreset     (e.g. "friendly", "formal", "supportive")
 *   - useFillers     (boolean, default true)
 *   - outputFormat   (string, ElevenLabs output_format, default "ulaw_8000")
 *   - acceptMime     (string, Accept header, default "audio/mpeg")
 *   - explicitVoiceId (string, overrides everything for voice selection)
 */
async function synthesizeSpeech(text, langCode = "en-US", options = {}) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY in .env");

    let {
      tenantId = null,
      regionCode = null,
      tonePreset = "friendly",
      useFillers = true,
      outputFormat = "ulaw_8000",
      acceptMime = "audio/mpeg",
      explicitVoiceId = null,
    } = options || {};

    // ---------------------------------
    // 0) Load tenant voice profile (if tenantId present)
    // ---------------------------------
    let voiceProfile = null;
    try {
      voiceProfile = await getTenantVoiceProfile(tenantId, langCode);
    } catch (profileErr) {
      console.warn(
        "⚠️ [tts] Failed to load tenant voice profile, using defaults:",
        profileErr.message
      );
    }

    if (voiceProfile) {
      // Override tone & region if not explicitly provided
      tonePreset = options.tonePreset || voiceProfile.tone_preset || tonePreset;
      regionCode = options.regionCode || voiceProfile.region_code || regionCode;
    }

    // ---------------------------------
    // 1) Pre-process text for voice
    //    (accent shaping → prosody → fillers)
    // ---------------------------------
    let processedText = text;

    try {
      processedText = applyAccentShaping(processedText, {
        langCode,
        regionCode,
      });

      processedText = applyProsody(processedText, {
        langCode,
        tonePreset,
      });

      if (useFillers) {
        processedText = injectFillers(processedText, {
          langCode,
          tonePreset,
        });
      }
    } catch (preErr) {
      console.warn(
        "⚠️ [tts] Pre-processing (prosody/accent/fillers) failed, falling back to raw text:",
        preErr.message
      );
      processedText = text;
    }

    // ---------------------------------
    // 2) Voice selection
    // ---------------------------------
    let voiceId = voiceMap[langCode] || DEFAULT_VOICE_ID;

    if (voiceProfile && voiceProfile.voice_id) {
      voiceId = voiceProfile.voice_id;
    }

    if (typeof explicitVoiceId === "string" && explicitVoiceId.trim()) {
      voiceId = explicitVoiceId.trim();
    }

    const voiceLang = (langCode.split("-")[0] || "en").toLowerCase();

    console.log(
      `🎙 [tts] Selected voiceId=${voiceId || "MISSING"} for langCode=${langCode}`
    );

    console.log("🧠 [tts] Text pipeline preview:", {
      original_preview: text.substring(0, 80) + "...",
      processed_preview: processedText.substring(0, 80) + "...",
      langCode,
      regionCode,
      tonePreset,
      useFillers,
      tenantId,
      has_profile: !!voiceProfile,
      outputFormat,
      explicitVoiceId: !!explicitVoiceId,
    });

    // Base voice settings (default)
    let stability = 0.4;
    let similarity_boost = 0.8;

    if (voiceProfile) {
      if (typeof voiceProfile.stability === "number") {
        stability = voiceProfile.stability;
      }
      if (typeof voiceProfile.similarity_boost === "number") {
        similarity_boost = voiceProfile.similarity_boost;
      }
    }

    // ---------------------------------
    // 3) ElevenLabs API call
    //    For Twilio we use "ulaw_8000".
    //    For browser preview we can override with "mp3_44100_128".
    // ---------------------------------
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`;
    console.log("📤 [tts] API Request:", {
      url,
      model_id: "eleven_multilingual_v2",
      language_code: voiceLang,
      text_preview: processedText.substring(0, 80) + "...",
      stability,
      similarity_boost,
      outputFormat,
    });

    const response = await axios.post(
      url,
      {
        text: processedText,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability, similarity_boost },
      },
      {
        headers: {
          "xi-api-key": apiKey,
          Accept: acceptMime,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      }
    );

    console.log("✅ [tts] ElevenLabs synthesis complete", {
      bytes: response.data ? response.data.length : 0,
    });
    return Buffer.from(response.data);
  } catch (err) {
    console.error(
      "❌ [tts] ElevenLabs error:",
      err.response?.data || err.message
    );
    throw new Error(
      "ElevenLabs TTS failed: " + (err.response?.statusText || err.message)
    );
  }
}

module.exports = { synthesizeSpeech };
