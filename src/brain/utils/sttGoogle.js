// src/brain/utils/sttGoogle.js
// Google Cloud Speech-to-Text streaming helper for Twilio Media Streams (μ-law 8k)

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

  // Fallback: default credentials
  cachedClient = new speech.SpeechClient();
  return cachedClient;
}

function buildStreamingRequest(languageCode = "en-US") {
  return {
    config: {
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
    },
    interimResults: true,
    singleUtterance: false,
    enableVoiceActivityEvents: true,
  };
}

function normalizeTranscript(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Creates one persistent Google streaming STT session for a live Twilio call.
 *
 * @param {object} opts
 * @param {string} opts.languageCode
 * @param {(text:string, data?:object)=>void} [opts.onInterim]
 * @param {(text:string, data?:object)=>void} [opts.onFinal]
 * @param {(data?:object)=>void} [opts.onSpeechStart]
 * @param {(data?:object)=>void} [opts.onSpeechEnd]
 * @param {(err:Error)=>void} [opts.onError]
 * @returns {{
 *   writeAudio: (audioBuffer: Buffer) => boolean,
 *   end: () => void,
 *   destroy: () => void,
 *   isActive: () => boolean
 * }}
 */
function createStreamingTranscriber({
  languageCode = "en-US",
  onInterim = () => {},
  onFinal = () => {},
  onSpeechStart = () => {},
  onSpeechEnd = () => {},
  onError = () => {},
} = {}) {
  const client = getSpeechClient();

  let recognizeStream = null;
  let active = false;
  let ended = false;
  let lastFinalTranscript = "";
  let lastInterimTranscript = "";

  function safeEmitError(err) {
    try {
      onError(err);
    } catch (callbackErr) {
      console.error("❌ [stt] onError callback failed:", callbackErr.message);
    }
  }

  function startStream(useFallbackModel = false) {
    const request = buildStreamingRequest(languageCode);

    if (useFallbackModel) {
      request.config.model = "default";
      request.config.useEnhanced = false;
      console.warn(
        "⚠️ [stt] Streaming phone_call model failed, retrying with default model."
      );
    }

    recognizeStream = client
      .streamingRecognize(request)
      .on("error", (err) => {
        active = false;

        const errMsg = err?.message || String(err);
        console.error("❌ [stt] Streaming STT error:", errMsg);

        // Retry once with fallback model for model-related failures
        if (!useFallbackModel && /phone_call|useEnhanced|model/i.test(errMsg)) {
          try {
            startStream(true);
            return;
          } catch (retryErr) {
            safeEmitError(retryErr);
            return;
          }
        }

        safeEmitError(err);
      })
      .on("data", (data) => {
        try {
          const speechEventType = data?.speechEventType;

          if (
            speechEventType === "SPEECH_ACTIVITY_BEGIN" ||
            speechEventType === 2
          ) {
            onSpeechStart(data);
          }

          if (
            speechEventType === "SPEECH_ACTIVITY_END" ||
            speechEventType === 3
          ) {
            onSpeechEnd(data);
          }

          const results = data?.results || [];
          if (!results.length) return;

          const result = results[0];
          const transcript = normalizeTranscript(
            result?.alternatives?.[0]?.transcript || ""
          );

          if (!transcript) return;

          if (result.isFinal) {
            if (transcript !== lastFinalTranscript) {
              lastFinalTranscript = transcript;
              lastInterimTranscript = "";
              onFinal(transcript, data);
            }
            return;
          }

          if (transcript !== lastInterimTranscript) {
            lastInterimTranscript = transcript;
            onInterim(transcript, data);
          }
        } catch (err) {
          safeEmitError(err);
        }
      });

    active = true;
    ended = false;

    console.log("🎙️ [stt] Streaming STT session started", {
      languageCode,
      model: request.config.model,
      useEnhanced: request.config.useEnhanced,
    });
  }

  startStream(false);

  return {
    writeAudio(audioBuffer) {
      if (
        ended ||
        !active ||
        !recognizeStream ||
        !audioBuffer ||
        !audioBuffer.length
      ) {
        return false;
      }

      try {
        recognizeStream.write(audioBuffer);
        return true;
      } catch (err) {
        safeEmitError(err);
        return false;
      }
    },

    end() {
      if (ended) return;

      ended = true;
      active = false;

      try {
        recognizeStream?.end();
      } catch (err) {
        safeEmitError(err);
      }

      recognizeStream = null;
      console.log("🛑 [stt] Streaming STT session ended");
    },

    destroy() {
      if (ended) return;

      ended = true;
      active = false;

      try {
        recognizeStream?.destroy();
      } catch (err) {
        safeEmitError(err);
      }

      recognizeStream = null;
      console.log("🧹 [stt] Streaming STT session destroyed");
    },

    isActive() {
      return active && !ended;
    },
  };
}

/**
 * Backward-compatible helper kept temporarily so older code does not crash.
 * Avoid using this for live streaming calls.
 *
 * @param {Buffer} audioBuffer
 * @param {object} opts
 * @param {string} opts.languageCode
 * @returns {Promise<string>}
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
    console.warn(
      "⚠️ [stt] phone_call config failed, retrying with default model:",
      err.message
    );

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

  return normalizeTranscript(
    (response.results || [])
      .map((r) => r?.alternatives?.[0]?.transcript || "")
      .join(" ")
  );
}

module.exports = {
  getSpeechClient,
  createStreamingTranscriber,
  transcribeMulaw,
};