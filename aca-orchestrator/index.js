// index.js – Orchestrator with Tanglish detection + debug logging
const { retrieveAnswer } = require("./retriever");
const { synthesizeSpeech } = require("./tts");
const OpenAI = require("openai");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { save: saveSession, load: loadSession } = require("./src/brain/utils/sessionState");
const { getMetricsText, markRecovery } = require("./src/monitor/resilienceMetrics");

console.log("🧠 Startup check:", {
  OPENAI: !!process.env.OPENAI_API_KEY,
  DB: !!process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV
});

// Global in-memory session placeholder (align with your actual objects)
global.__ACA_STATE__ = { activeSessions: [], version: "5.3.A" };

// Restore on boot
const prior = loadSession();
if (prior && prior.activeSessions) {
  global.__ACA_STATE__.activeSessions = prior.activeSessions;
  markRecovery();
  console.log("♻️  Restored session state:", prior.activeSessions.length, "items");
}

// Graceful snapshot on shutdown/crash
process.on("SIGINT", () => { try { saveSession(global.__ACA_STATE__); } finally { process.exit(0); } });
process.on("uncaughtException", (err) => { console.error(err); saveSession(global.__ACA_STATE__); process.exit(1); });
process.on("unhandledRejection", (err) => { console.error(err); saveSession(global.__ACA_STATE__); process.exit(1); });

// OPTIONAL: expose metrics if not already mounted in your monitor routes
const express = require("express");
const app = global.__EXPRESS_APP__ || null; // if you already created one elsewhere, reuse it
if (app && typeof app.get === "function") {
  app.get("/monitor/resilience", (req, res) => {
    res.set("Content-Type", "text/plain; version=0.0.4");
    res.send(getMetricsText());
  });
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const FORCE_LANG = process.env.FORCE_LANG || ""; // FORCE_LANG=ta-IN to lock for demo

let lastTranscript = "";
let sessionLang = FORCE_LANG || "en-US"; // default session language

// --- Smarter Tamil detection (Tanglish aware) ---
async function detectTamilSmart(transcript) {
  const tamilScript = /[\u0B80-\u0BFF]/;
  if (tamilScript.test(transcript)) {
    console.log("🔎 Tamil Unicode detected in transcript.");
    return true;
  }

  const phoneticHints = [
    "epo", "epoo", "epdi", "sapadu", "saapadu",
    "iruka", "irukka", "unga", "ungal", "illai",
    "seri", "aama", "amma", "appa", "open aa", "close aa"
  ];
  if (phoneticHints.some(h => transcript.toLowerCase().includes(h))) {
    console.log("🔎 Tamil phonetic hint detected in transcript.");
    return true;
  }

  // Fallback: ask OpenAI
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Detect if this text is Tamil (Tanglish) even if written in English letters. Reply only 'ta-IN' or 'en-US'."
        },
        { role: "user", content: transcript }
      ],
    });
    const guess = r.choices[0].message.content.trim();
    console.log("🌐 OpenAI language guess:", guess);
    return guess === "ta-IN";
  } catch (err) {
    console.warn("⚠️ detectTamilSmart OpenAI fallback failed:", err.message);
    return false;
  }
}

// --- General language detection with OpenAI ---
async function detectLanguageWithOpenAI(transcript) {
  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Detect the language of this text. Reply only with a BCP-47 code (en-US, hi-IN, es-ES, ta-IN)."
      },
      { role: "user", content: transcript }
    ],
  });
  return r.choices[0].message.content.trim();
}

// --- Handle incoming STT response ---
async function onSTTResponse(data, businessId, ws) {
  const result = data.results[0];
  const transcript = result.alternatives[0].transcript;

  if (result.isFinal) {
    console.log("📝 Final transcript:", transcript);
    lastTranscript = transcript;
    await onFinalTranscript(transcript, "auto", businessId, ws);
  } else {
    console.log("⏳ Interim transcript:", transcript);
    lastTranscript = transcript;
  }
}

// --- Handle stream end fallback ---
async function onStreamEnd(businessId, ws) {
  if (lastTranscript) {
    console.log("⚠️ No final transcript. Using last interim:", lastTranscript);
    await onFinalTranscript(lastTranscript, "auto", businessId, ws);
  }
}

// --- Main pipeline: transcript → KB → GPT → TTS ---
async function onFinalTranscript(transcript, langCode, businessId, ws) {
  console.log("🛠 onFinalTranscript called with transcript:", transcript, "incoming langCode:", langCode);

  try {
    // Step 1: Force demo language if configured
    if (FORCE_LANG) {
      langCode = FORCE_LANG;
      console.log("🔒 FORCE_LANG applied:", langCode);
    } else {
      // Step 2: Tamil/Tanglish detection
      if (await detectTamilSmart(transcript)) {
        langCode = "ta-IN";
        console.log("🔄 Tanglish/Tamil override triggered →", langCode);
      }

      // Step 3: Hybrid detection if still auto
      if (langCode === "auto") {
        let guess = sessionLang;
        try {
          guess = await detectLanguageWithOpenAI(transcript);
          console.log("🌐 OpenAI fallback detected:", guess);
        } catch (err) {
          console.warn("⚠️ detectLanguageWithOpenAI failed:", err.message);
        }
        langCode = guess;
      }

      // Step 4: Respect session language if already switched
      if (!FORCE_LANG && sessionLang && sessionLang !== "en-US") {
        console.log("🔁 Using sessionLang override:", sessionLang);
        langCode = sessionLang;
      }
    }

    console.log("➡️ Final decision: langCode =", langCode, "| sessionLang =", sessionLang);

    // Step 5: Retrieve KB answer
    const answer = await retrieveAnswer(transcript, businessId, langCode);
    console.log("📋 Retrieved/polished answer:", answer);

    // Step 6: Synthesize speech
    console.log("🔈 Sending to TTS with langCode:", langCode);
    const audioBuffer = await synthesizeSpeech(answer, langCode);

    ws.send(JSON.stringify({
      event: "media",
      media: { payload: audioBuffer.toString("base64") }
    }));

    // Step 7: Persist session language
    sessionLang = langCode;
    console.log("✅ Spoke in", langCode);

  } catch (err) {
    console.error("❌ Error in onFinalTranscript:", err);
    ws.send(JSON.stringify({
      event: "media",
      media: { payload: Buffer.from("Sorry, something went wrong.").toString("base64") }
    }));
  }
}

module.exports = { onSTTResponse, onStreamEnd };

// ---------------------------------------------------------------------------
// ✅ KEEP-ALIVE SERVER FOR CLOUD DEPLOYMENT (Render / Heroku / etc.)
// ---------------------------------------------------------------------------
try {
  const express = require("express");
  const healthApp = express();
  const PORT = process.env.PORT || 8080;

  healthApp.get("/health", (req, res) => {
    res.json({ ok: true, message: "ACA orchestrator running" });
  });

  healthApp.listen(PORT, () => {
    console.log(`🚀 ACA Orchestrator running on port ${PORT}`);
  });
} catch (err) {
  console.error("⚠️ Express startup failed:", err.message);
}
