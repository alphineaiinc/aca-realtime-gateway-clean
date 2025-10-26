// index.js – Orchestrator with Tanglish detection + debug logging
const { retrieveAnswer } = require("./retriever");
const { synthesizeSpeech } = require("./tts");
const OpenAI = require("openai");
const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------------------------
// 🧩 Story 9.6 – Unified Global Deployment & Testing Hook
// ---------------------------------------------------------------------------
const deployLogPath = path.join(__dirname, "src/logs/deploy_tracker.log");
try {
  if (!fs.existsSync(path.dirname(deployLogPath))) {
    fs.mkdirSync(path.dirname(deployLogPath), { recursive: true });
  }
  fs.appendFileSync(
    deployLogPath,
    `\n[${new Date().toISOString()}] Deployment started for ${process.env.NODE_ENV || "production"}`
  );
  console.log("📦 Deployment tracker log updated:", deployLogPath);
} catch (err) {
  console.warn("⚠️ Unable to write deploy tracker log:", err.message);
}
// ---------------------------------------------------------------------------

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ Force-load orchestrator-level .env (absolute path)
const dotenvPath = path.resolve(__dirname, "./.env");
console.log("🧩 index.js loading .env from:", dotenvPath);
require("dotenv").config({ path: dotenvPath, override: true });

const { save: saveSession, load: loadSession } = require("./src/brain/utils/sessionState");
const { getMetricsText, markRecovery } = require("./src/monitor/resilienceMetrics");

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

// ============================================================
// EXPRESS APP INITIALIZATION (required for Render)
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const app = express();

// Enable middleware globally
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// ============================================================
// === System & Health Routes ===
app.get("/", (req, res) => {
  res.status(200).send("Welcome to Alphine AI. The call orchestration service is active.");
});

app.get("/monitor/resilience", (req, res) => {
  res.set("Content-Type", "text/plain; version=0.0.4");
  res.send(getMetricsText());
});

// ============================================================
// === Story 9.5.2 — Backend Voice Profile API integration ===
try {
  const voiceProfileRoutes = require("./src/routes/voiceProfile");
  app.use("/", voiceProfileRoutes);
  console.log("✅ Mounted / (voiceProfileRoutes)");
} catch (err) {
  console.warn("⚠️ voiceProfileRoutes not loaded:", err.message);
}

// ============================================================
// === Tenant Management Routes ===
try {
  const tenantRoutes = require("./src/routes/tenant");
  app.use("/tenant", tenantRoutes);
  console.log("✅ Mounted /tenant routes");
} catch (err) {
  console.warn("⚠️ tenantRoutes not loaded:", err.message);
}

try {
  const uploadKnowledgeRoutes = require("./src/routes/uploadKnowledge");
  app.use("/", uploadKnowledgeRoutes);
  console.log("✅ Mounted /tenant/upload-knowledge");
} catch (err) {
  console.warn("⚠️ uploadKnowledge route not loaded:", err.message);
}

// ============================================================
// === Story 9.6 — Global Matrix Health Endpoint ===
// ============================================================
app.get("/monitor/deploy-matrix", async (req, res) => {
  try {
    const dashboardUrl = process.env.DASHBOARD_URL || "https://alphine-dashboard.vercel.app";
    const backendUrl = process.env.RENDER_BASE_URL || "https://aca-realtime-gateway-clean.onrender.com";
    const supported = (process.env.SUPPORTED_LANGUAGES_GLOBAL || "en,ta,es,fr,hi").split(",");

    const result = {
      service: "ACA-Orchestrator",
      environment: process.env.NODE_ENV || "production",
      timestamp: new Date().toISOString(),
      render_backend: backendUrl,
      vercel_dashboard: dashboardUrl,
      supported_languages: supported,
    };

    res.status(200).json({ ok: true, matrix: result });
  } catch (err) {
    console.error("❌ /monitor/deploy-matrix error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// === Knowledge Brain Query Route (for test_multilang.ps1) ===
// ============================================================
// ============================================================
// === Knowledge Brain Query Route (for test_multilang.ps1) ===
// ============================================================
try {
  const brainRoutes = require("./src/routes/brain");
  app.use("/brain", brainRoutes);
  console.log("✅ Mounted /brain routes for global matrix test");
} catch (err) {
  console.warn("⚠️ brainRoutes not loaded:", err.message);
}


// ============================================================
// === Server Start ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 ACA Orchestrator running on port ${PORT}`);
});

global.__EXPRESS_APP__ = app; // keep for any module reuse
// ============================================================

// ============================================================
// === Language Detection Logic ===
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
