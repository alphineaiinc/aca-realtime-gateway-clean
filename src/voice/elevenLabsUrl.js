"use strict";

// Pure URL boundary for authenticated ElevenLabs requests.
const ALLOWED_OUTPUT_FORMATS = new Set(["ulaw_8000", "mp3_44100_128"]);
const VOICE_ID_PATTERN = /^[A-Za-z0-9]{8,64}$/;

function buildElevenLabsTtsUrl(voiceId, outputFormat) {
  if (typeof voiceId !== "string" || !VOICE_ID_PATTERN.test(voiceId)) {
    throw new TypeError("Invalid ElevenLabs voice ID");
  }
  if (typeof outputFormat !== "string" || !ALLOWED_OUTPUT_FORMATS.has(outputFormat)) {
    throw new TypeError("Unsupported ElevenLabs output format");
  }
  const url = new URL("https://api.elevenlabs.io");
  url.pathname = "/v1/text-to-speech/" + encodeURIComponent(voiceId);
  url.searchParams.set("output_format", outputFormat);
  return url.toString();
}

module.exports = { buildElevenLabsTtsUrl };
