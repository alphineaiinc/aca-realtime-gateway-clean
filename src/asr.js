"use strict";
const speech = require("@google-cloud/speech");

const client = new speech.SpeechClient();

function createAsrStream(connId, logger) {
  const request = {
    config: {
      encoding: "MULAW",         // Twilio sends µ-law PCM
      sampleRateHertz: 8000,     // Twilio streams at 8kHz
      languageCode: "en-US",     // Default language
    },
    interimResults: true,        // Get partial results
    singleUtterance: false,
  };

  const recognizeStream = client
    .streamingRecognize(request)
    .on("error", (err) => logger.error({ connId, err: String(err) }, "ASR error"))
    .on("data", (data) => {
      const transcript = data.results[0]?.alternatives[0]?.transcript;
      const isFinal = data.results[0]?.isFinal;
      if (transcript) {
        logger.info({ connId, isFinal, transcript }, "ASR transcript");
      }
    });

  return recognizeStream;
}

module.exports = { createAsrStream };
