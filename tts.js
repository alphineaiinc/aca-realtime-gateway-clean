// ===============================================
// tts.js — Alphine AI Text-to-Speech Handler
// Story 9.3 / 9.5 / 10.3 Integration + Global 113-language layer
// Temporary provider swap: OpenAI default, ElevenLabs optional fallback
// ===============================================
const axios = require("axios");
const path = require("path");
const OpenAI = require("openai");

// ------------------------------------------------------
// Global language registry (Story 9.1 / 9.7)
// ------------------------------------------------------
let languageRegistry = null;
try {
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

function isKnownLanguageCode(langCode) {
  if (!langCode || typeof langCode !== "string" || !languageRegistry) {
    return false;
  }
  const all = languageRegistry.languages || {};
  if (all[langCode]) return true;
  const base = langCode.split("-")[0];
  return Boolean(all[base]);
}

console.log("📦 [tts] module loaded from:", __filename);

// ------------------------------------------------------
// Optional conversational helpers (prosody / fillers / accent)
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

// ------------------------------------------------------
// Tenant voice profile loader (Story 9.5)
// ------------------------------------------------------
let getTenantVoiceProfile = async () => null;
try {
  ({ getTenantVoiceProfile } = require("./src/brain/utils/voiceProfileLoader"));
} catch (e) {
  console.warn("⚠️ [tts] voiceProfileLoader not found, tenant profiles disabled.");
}

// ------------------------------------------------------
// Provider + OpenAI client
// ------------------------------------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_TTS_PROVIDER = String(process.env.TTS_PROVIDER || "openai")
  .trim()
  .toLowerCase();

// ------------------------------------------------------
// ElevenLabs voice mapping (kept for later switch-back)
// ------------------------------------------------------
const voiceMap = {
  "en-US": "21m00Tcm4TlvDq8ikWAM",
  "en-IN": "21m00Tcm4TlvDq8ikWAM",
  "ta-IN": "TxGEqnHWrfWFTfGW9XjX",
  "fr-FR": "EXAVITQu4vr4xnSDxMaL",
  "fr-CA": "EXAVITQu4vr4xnSDxMaL",
  "es-ES": "pNInz6obpgDQGcFmaJgB",
  "hi-IN": "MF3mGyEYCl7XYWbV9V6O",
};

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

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

  if (isKnownLanguageCode(langCode)) {
    console.log(
      "🌍 [tts] Known language without specific ElevenLabs mapping, falling back to default:",
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

// ------------------------------------------------------
// OpenAI voice mapping
// ------------------------------------------------------
const openAiVoiceMap = {
  "en-US": process.env.OPENAI_TTS_VOICE_EN_US || process.env.OPENAI_TTS_VOICE || "marin",
  "en-IN": process.env.OPENAI_TTS_VOICE_EN_IN || process.env.OPENAI_TTS_VOICE || "marin",
  "ta-IN": process.env.OPENAI_TTS_VOICE_TA_IN || process.env.OPENAI_TTS_VOICE || "marin",
  "fr-FR": process.env.OPENAI_TTS_VOICE_FR_FR || process.env.OPENAI_TTS_VOICE || "marin",
  "fr-CA": process.env.OPENAI_TTS_VOICE_FR_CA || process.env.OPENAI_TTS_VOICE || "marin",
  "es-ES": process.env.OPENAI_TTS_VOICE_ES_ES || process.env.OPENAI_TTS_VOICE || "marin",
  "hi-IN": process.env.OPENAI_TTS_VOICE_HI_IN || process.env.OPENAI_TTS_VOICE || "marin",
};

const SUPPORTED_OPENAI_VOICES = new Set([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
  "coral",
  "verse",
  "ballad",
  "ash",
  "sage",
  "marin",
  "cedar",
]);

function normalizeOpenAiVoice(value) {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) return null;
  return SUPPORTED_OPENAI_VOICES.has(trimmed) ? trimmed : null;
}

function resolveOpenAiVoice(langCode, voiceProfile, explicitVoiceId) {
  const explicitOpenAiVoice = normalizeOpenAiVoice(explicitVoiceId);
  if (explicitOpenAiVoice) {
    return explicitOpenAiVoice;
  }

  const profileOpenAiVoice = normalizeOpenAiVoice(
    voiceProfile && (voiceProfile.openai_voice || voiceProfile.openai_voice_id)
  );
  if (profileOpenAiVoice) {
    return profileOpenAiVoice;
  }

  const mappedOpenAiVoice = normalizeOpenAiVoice(
    langCode && openAiVoiceMap[langCode]
  );
  if (mappedOpenAiVoice) {
    return mappedOpenAiVoice;
  }

  return normalizeOpenAiVoice(process.env.OPENAI_TTS_VOICE) || "marin";
}
function safePreview(value, max = 80) {
  const str = typeof value === "string" ? value : String(value ?? "");
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function normalizeApiKey(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function decodeErrorBody(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (typeof data === "object") {
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }
  return String(data);
}

// ------------------------------------------------------
// PCM16 mono downsample + G.711 μ-law
// OpenAI PCM path for Twilio telephony
// ------------------------------------------------------
function downsamplePcm16Mono(pcmBuffer, inSampleRate, outSampleRate) {
  if (!Buffer.isBuffer(pcmBuffer) || pcmBuffer.length < 2) {
    return Buffer.alloc(0);
  }

  if (!Number.isFinite(inSampleRate) || !Number.isFinite(outSampleRate)) {
    throw new Error("Invalid sample rates");
  }

  if (inSampleRate === outSampleRate) {
    return Buffer.from(pcmBuffer);
  }

  const inputSamples = Math.floor(pcmBuffer.length / 2);
  if (inputSamples <= 0) {
    return Buffer.alloc(0);
  }

  const durationSeconds = inputSamples / inSampleRate;
  const outputSamples = Math.max(1, Math.floor(durationSeconds * outSampleRate));
  const out = Buffer.alloc(outputSamples * 2);

  for (let j = 0; j < outputSamples; j += 1) {
    const srcIndex = Math.min(
      inputSamples - 1,
      Math.floor((j * inSampleRate) / outSampleRate)
    );
    const sample = pcmBuffer.readInt16LE(srcIndex * 2);
    out.writeInt16LE(sample, j * 2);
  }

  return out;
}

const MU_LAW_BIAS = 0x84;
const MU_LAW_CLIP = 32635;

function linear16SampleToMulaw(sample) {
  let sign = 0;
  let magnitude = sample;

  if (magnitude < 0) {
    sign = 0x80;
    magnitude = -magnitude;
  }

  if (magnitude > MU_LAW_CLIP) {
    magnitude = MU_LAW_CLIP;
  }

  magnitude += MU_LAW_BIAS;

  let exponent = 7;
  for (
    let expMask = 0x4000;
    (magnitude & expMask) === 0 && exponent > 0;
    exponent -= 1
  ) {
    expMask >>= 1;
  }

  const mantissa = (magnitude >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function pcm16ToMulaw(pcm16Buffer) {
  if (!Buffer.isBuffer(pcm16Buffer) || pcm16Buffer.length < 2) {
    return Buffer.alloc(0);
  }

  const sampleCount = Math.floor(pcm16Buffer.length / 2);
  const out = Buffer.alloc(sampleCount);

  for (let i = 0; i < sampleCount; i += 1) {
    const sample = pcm16Buffer.readInt16LE(i * 2);
    out[i] = linear16SampleToMulaw(sample);
  }

  return out;
}

function pcm24kToMulaw8k(pcmBuffer) {
  const pcm8k = downsamplePcm16Mono(pcmBuffer, 24000, 8000);
  return pcm16ToMulaw(pcm8k);
}

// ------------------------------------------------------
// Shared text preprocessing
// ------------------------------------------------------
async function buildVoiceContext(text, langCode, options = {}) {
  let {
    tenantId = null,
    regionCode = null,
    tonePreset = "friendly",
    useFillers = true,
    outputFormat = "ulaw_8000",
    acceptMime = null,
    explicitVoiceId = null,
  } = options || {};

  if (outputFormat === "ulaw_8000") {
    acceptMime = "audio/basic";
  } else {
    acceptMime = "audio/mpeg";
  }

  console.log("🧪 [tts] normalized request options", {
    tenantId,
    regionCode,
    tonePreset,
    useFillers,
    outputFormat,
    acceptMime,
    hasExplicitVoiceId: !!explicitVoiceId,
    provider: DEFAULT_TTS_PROVIDER,
  });

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
    tonePreset = options.tonePreset || voiceProfile.tone_preset || tonePreset;
    regionCode = options.regionCode || voiceProfile.region_code || regionCode;
  }

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
      "⚠️ [tts] Pre-processing failed, falling back to raw text:",
      preErr.message
    );
    processedText = text;
  }

  return {
    tenantId,
    regionCode,
    tonePreset,
    useFillers,
    outputFormat,
    acceptMime,
    explicitVoiceId,
    voiceProfile,
    processedText,
  };
}

// ------------------------------------------------------
// OpenAI TTS branch
// ------------------------------------------------------
async function synthesizeWithOpenAI(text, langCode = "en-US", options = {}) {
  const apiKey = normalizeApiKey(process.env.OPENAI_API_KEY);

  console.log("🔐 [tts:openai] key exists:", !!process.env.OPENAI_API_KEY);
  console.log("🔐 [tts:openai] key trimmed exists:", !!apiKey);
  console.log("🔐 [tts:openai] key length:", apiKey ? apiKey.length : 0);

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in environment");
  }

  const ctx = await buildVoiceContext(text, langCode, options);
  const model = String(process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts").trim();
  const voice = resolveOpenAiVoice(langCode, ctx.voiceProfile, ctx.explicitVoiceId);

  console.log("🎙 [tts:openai] Voice resolution detail:", {
  explicitVoiceId: ctx.explicitVoiceId || null,
  profileVoiceId: ctx.voiceProfile?.voice_id || null,
  profileOpenAiVoice: ctx.voiceProfile?.openai_voice || ctx.voiceProfile?.openai_voice_id || null,
  selectedVoice: voice,
});

  console.log("🎙 [tts:openai] Selected voice:", {
    voice,
    model,
    langCode,
    outputFormat: ctx.outputFormat,
  });

  console.log("🧠 [tts:openai] Text pipeline preview:", {
    original_preview: safePreview(text),
    processed_preview: safePreview(ctx.processedText),
    langCode,
    regionCode: ctx.regionCode,
    tonePreset: ctx.tonePreset,
    useFillers: ctx.useFillers,
    tenantId: ctx.tenantId,
    has_profile: !!ctx.voiceProfile,
    outputFormat: ctx.outputFormat,
    explicitVoiceId: !!ctx.explicitVoiceId,
  });

  const requestedFormat = ctx.outputFormat === "ulaw_8000" ? "pcm" : "mp3";
  const startedAt = Date.now();

  console.log("📤 [tts:openai] API Request:", {
    model,
    voice,
    requestedFormat,
    text_preview: safePreview(ctx.processedText),
  });

  try {
    const response = await openai.audio.speech.create(
      {
        model,
        voice,
        input: ctx.processedText,
        response_format: requestedFormat,
      },
      {
        timeout: 15000,
      }
    );

    const arrayBuffer = await response.arrayBuffer();
    const rawAudio = Buffer.from(arrayBuffer);

    console.log("✅ [tts:openai] audio received", {
      rawBytes: rawAudio.length,
      requestedFormat,
      elapsedMs: Date.now() - startedAt,
    });

    if (!rawAudio.length) {
      throw new Error("OpenAI TTS returned empty audio buffer");
    }

    let finalBuffer = rawAudio;

    if (ctx.outputFormat === "ulaw_8000") {
      finalBuffer = pcm24kToMulaw8k(rawAudio);

      console.log("🔄 [tts:openai] converted pcm24k -> mulaw8k", {
        rawBytes: rawAudio.length,
        finalBytes: finalBuffer.length,
      });
    }

    if (!finalBuffer.length) {
      throw new Error("Final TTS audio buffer is empty after conversion");
    }

    console.log("📦 [tts:openai] returning audio buffer", {
      bytes: finalBuffer.length,
      voice,
      langCode,
      outputFormat: ctx.outputFormat,
      elapsedMs: Date.now() - startedAt,
    });

    return finalBuffer;
  } catch (err) {
    const status = err.status || err.response?.status || null;
    const statusText = err.statusText || err.response?.statusText || null;
    const decodedError = decodeErrorBody(err.response?.data) || err.message;

    console.error("❌ [tts:openai] status:", status);
    console.error("❌ [tts:openai] statusText:", statusText);
    console.error("❌ [tts:openai] error body:", decodedError);
    console.error("❌ [tts:openai] elapsedMs:", Date.now() - startedAt);
    console.error("❌ [tts:openai] request failed in file:", __filename);

    throw new Error("OpenAI TTS failed: " + (statusText || decodedError || err.message));
  }
}

// ------------------------------------------------------
// ElevenLabs TTS branch (kept for later switch-back)
// ------------------------------------------------------
async function synthesizeWithElevenLabs(text, langCode = "en-US", options = {}) {
  const rawApiKey = process.env.ELEVENLABS_API_KEY;
  const apiKey = normalizeApiKey(rawApiKey);

  console.log("🔐 [tts:elevenlabs] key exists:", !!rawApiKey);
  console.log("🔐 [tts:elevenlabs] key trimmed exists:", !!apiKey);
  console.log("🔐 [tts:elevenlabs] key length:", apiKey ? apiKey.length : 0);
  console.log("🔐 [tts:elevenlabs] key prefix:", apiKey ? apiKey.slice(0, 5) : "NONE");

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY in environment");
  }

  const ctx = await buildVoiceContext(text, langCode, options);
  const selectedVoiceId = resolveVoiceId(langCode, ctx.voiceProfile, ctx.explicitVoiceId);
  const baseLang = (langCode.split("-")[0] || "en").toLowerCase();

  console.log("🚀 [tts:elevenlabs] FINAL HEADERS:", {
    acceptMime: ctx.acceptMime,
    outputFormat: ctx.outputFormat,
  });

  console.log(
    `🎙 [tts:elevenlabs] Selected voiceId=${selectedVoiceId || "MISSING"} for langCode=${langCode}`
  );

  console.log("🧠 [tts:elevenlabs] Text pipeline preview:", {
    original_preview: safePreview(text),
    processed_preview: safePreview(ctx.processedText),
    langCode,
    regionCode: ctx.regionCode,
    tonePreset: ctx.tonePreset,
    useFillers: ctx.useFillers,
    tenantId: ctx.tenantId,
    has_profile: !!ctx.voiceProfile,
    outputFormat: ctx.outputFormat,
    explicitVoiceId: !!ctx.explicitVoiceId,
  });

  let stability = 0.4;
  let similarity_boost = 0.8;

  if (ctx.voiceProfile) {
    if (typeof ctx.voiceProfile.stability === "number") {
      stability = ctx.voiceProfile.stability;
    }
    if (typeof ctx.voiceProfile.similarity_boost === "number") {
      similarity_boost = ctx.voiceProfile.similarity_boost;
    }
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}?output_format=${ctx.outputFormat}`;
  console.log("📤 [tts:elevenlabs] API Request:", {
    url,
    model_id: "eleven_multilingual_v2",
    language_code: baseLang,
    text_preview: safePreview(ctx.processedText),
    stability,
    similarity_boost,
    outputFormat: ctx.outputFormat,
    acceptMime: ctx.acceptMime,
    keyPrefix: apiKey ? apiKey.slice(0, 5) : "NONE",
    keyLength: apiKey ? apiKey.length : 0,
  });

  try {
    const response = await axios.post(
      url,
      {
        text: ctx.processedText,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability, similarity_boost },
      },
      {
        headers: {
          "xi-api-key": apiKey,
          Accept: ctx.acceptMime,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      }
    );

    console.log("✅ [tts:elevenlabs] synthesis complete", {
      bytes: response.data ? response.data.length : 0,
      voiceId: selectedVoiceId,
      langCode,
      outputFormat: ctx.outputFormat,
    });

    const finalBuffer = Buffer.from(response.data);

    console.log("📦 [tts:elevenlabs] returning audio buffer", {
      bytes: finalBuffer.length,
      voiceId: selectedVoiceId,
      langCode,
    });

    return finalBuffer;
  } catch (err) {
    const status = err.response?.status || null;
    const statusText = err.response?.statusText || null;
    const decodedError = decodeErrorBody(err.response?.data);

    console.error("❌ [tts:elevenlabs] status:", status);
    console.error("❌ [tts:elevenlabs] statusText:", statusText);
    console.error("❌ [tts:elevenlabs] error body:", decodedError || err.message);
    console.error("❌ [tts:elevenlabs] request failed in file:", __filename);
    console.error("❌ [tts:elevenlabs] axios error code:", err.code || null);

    throw new Error(
      "ElevenLabs TTS failed: " + (statusText || decodedError || err.message)
    );
  }
}

/**
 * synthesizeSpeech
 *
 * Existing public interface preserved.
 */
async function synthesizeSpeech(text, langCode = "en-US", options = {}) {
  console.log("🎯 [tts] synthesizeSpeech ENTER", {
    file: __filename,
    provider: DEFAULT_TTS_PROVIDER,
    langCode,
    textPreview: safePreview(text, 120),
    optionKeys: Object.keys(options || {}),
  });

  const provider = String(options.provider || DEFAULT_TTS_PROVIDER || "openai")
    .trim()
    .toLowerCase();

  if (provider === "elevenlabs") {
    return synthesizeWithElevenLabs(text, langCode, options);
  }

  return synthesizeWithOpenAI(text, langCode, options);
}

module.exports = { synthesizeSpeech };