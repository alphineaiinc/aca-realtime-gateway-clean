// ===============================================
// tts.js — Alphine AI Text-to-Speech Handler
// Story 9.3 / 9.5 / 10.3 Integration + Global 113-language layer
// ===============================================
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// ------------------------------------------------------
// Global language registry (Story 9.1 / 9.7)
// We don't need to hard-code all 113 languages in this file;
// we just make sure any BCP-47 code from the registry is accepted.
// ------------------------------------------------------
let languageRegistry = null;
try {
  // config/languageRegistry.json:
  // {
  //   "languages": {
  //      "as-IN": "Assamese (India)",
  //      "bn-IN": "Bengali (India)",
  //      ...
  //   }
  // }
  const registryPath = path.join(__dirname, "config", "languageRegistry.json");
  languageRegistry = require(registryPath);
  console.log(
    "🌍 [tts] Loaded languageRegistry.json with",
    languageRegistry && languageRegistry.languages
      ? Object.keys(languageRegistry.languages).length
      : 0,
    "entries"
  );
} catch (e) {
  console.warn(
    "⚠️ [tts] languageRegistry.json not found or unreadable – proceeding without explicit registry.",
    e.message
  );
}

// Helper to sanity-check a language code against the registry (if present)
function isKnownLanguageCode(langCode) {
  if (!langCode || typeof langCode !== "string" || !languageRegistry) {
    return false;
  }
  const all = languageRegistry.languages || {};
  if (all[langCode]) return true;
  const base = langCode.split("-")[0];
  // Some registries may use base codes (e.g. "en") in addition to full BCP-47
  return Boolean(all[base]);
}

// ------------------------------------------------------
// Optional conversational helpers (prosody / fillers / accent)
// If the modules are missing, we fall back to no-op so TTS
// keeps working without breaking.
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

// Tenant voice profile loader (Story 9.5)
let getTenantVoiceProfile = async () => null;
try {
  ({ getTenantVoiceProfile } = require("./src/brain/utils/voiceProfileLoader"));
} catch (e) {
  console.warn("⚠️ [tts] voiceProfileLoader not found, tenant profiles disabled.");
}

// --- Default voice mapping (per specific language code)
//
// NOTE: This is *not* the full 113-language list. These are just
// curated defaults for a few key locales. All other languages
// from languageRegistry.json will still work; they'll just
// fall back to DEFAULT_VOICE_ID unless the tenant profile
// overrides voice_id.
const voiceMap = {
  "en-US": "21m00Tcm4TlvDq8ikWAM", // ElevenLabs "Rachel" (neutral US)
  "en-IN": "21m00Tcm4TlvDq8ikWAM", // reuse neutral if no specific Indian set
  "ta-IN": "TxGEqnHWrfWFTfGW9XjX", // Tamil (placeholder / sample)
  "fr-FR": "EXAVITQu4vr4xnSDxMaL", // French
  "fr-CA": "EXAVITQu4vr4xnSDxMaL",
  "es-ES": "pNInz6obpgDQGcFmaJgB", // Spanish
  "hi-IN": "MF3mGyEYCl7XYWbV9V6O", // Hindi
};

// --- Default fallback voice ID (Rachel)
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/**
 * resolveVoiceId
 *
 * Order of precedence:
 *  1) explicitVoiceId (e.g. from Voice Studio preview payload)
 *  2) tenant voice profile voice_id (from DB)
 *  3) hard-coded voiceMap[langCode] for key locales
 *  4) DEFAULT_VOICE_ID
 */
function resolveVoiceId(langCode, voiceProfile, explicitVoiceId) {
  if (typeof explicitVoiceId === "string" && explicitVoiceId.trim()) {
    return explicitVoiceId.trim();
  }

  if (voiceProfile && typeof voiceProfile.voice_id === "string") {
    const trimmed = voiceProfile.voice_id.trim();
    if (trimmed) return trimmed;
  }

  if (langCode && voiceMap[langCode]) {
    return voiceMap[langCode];
  }

  // If we have a registry and the langCode is known, we can log it for visibility,
  // but we still fall back to DEFAULT_VOICE_ID unless we have a dedicated voice.
  if (isKnownLanguageCode(langCode)) {
    console.log(
      "🌍 [tts] Known language without specific voice mapping, falling back to default:",
      langCode
    );
  } else {
    console.log(
      "🌍 [tts] Unknown or unregistered language code, falling back to default:",
      langCode
    );
  }

  return DEFAULT_VOICE_ID;
}

/**
 * synthesizeSpeech
 *
 * @param {string} text      Raw text from GPT / ACA brain
 * @param {string} langCode  BCP-47 lang code like "en-US", "ta-IN", "fr-CA"
 *                           This can be ANY of our 113 supported languages
 *                           (from config/languageRegistry.json).
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
    // 2) Voice selection (global 113-language aware)
    // ---------------------------------
    const selectedVoiceId = resolveVoiceId(langCode, voiceProfile, explicitVoiceId);
    const baseLang = (langCode.split("-")[0] || "en").toLowerCase();

    console.log(
      `🎙 [tts] Selected voiceId=${selectedVoiceId || "MISSING"} for langCode=${langCode}`
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
    //    For browser preview we override with "mp3_44100_128".
    // ---------------------------------
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}?output_format=${outputFormat}`;
    console.log("📤 [tts] API Request:", {
      url,
      model_id: "eleven_multilingual_v2",
      language_code: baseLang,
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
