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

// Trust Render proxy and log runtime roots once
app.set("trust proxy", 1);
console.log("🧭 process.cwd():", process.cwd());
console.log("🧭 __dirname:", __dirname);

// ---------------------------------------------------------------------------
// ✅ Guaranteed serving of Marketplace manifest files (Render-safe absolute paths)
//    We keep your explicit routes AND add a regex catch-all to cover all proxies.
// ---------------------------------------------------------------------------
const wellKnownAbsolute = path.resolve(__dirname, "public", "wellknown");


// Your explicit endpoints (kept intact)
app.get("/.well-known/ai-plugin.json", (req, res) => {
  const filePath = path.join(wellKnownAbsolute, "ai-plugin.json");
  console.log("➡️  [.well-known] serving:", filePath);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("❌ Failed to send ai-plugin.json:", err.message, "→", filePath);
      res.status(404).send("Manifest not found");
    }
  });
});

app.get("/.well-known/openapi.yaml", (req, res) => {
  const filePath = path.join(wellKnownAbsolute, "openapi.yaml");
  console.log("➡️  [.well-known] serving:", filePath);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("❌ Failed to send openapi.yaml:", err.message, "→", filePath);
      res.status(404).send("OpenAPI spec not found");
    }
  });
});

// 🔒 Regex catch-all for any .well-known/* (covers caching/proxy edge-cases)
app.get(/^\/\.well-known\/(.+)$/i, (req, res) => {
  const requested = (req.params[0] || "").toString();
  const safeName = requested.replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(wellKnownAbsolute, safeName);
  console.log("➡️  [.well-known regex] request:", requested, "→", filePath);

  if (!fs.existsSync(filePath)) {
    console.error("❌ [.well-known regex] not found:", filePath);
    return res.status(404).send("Not Found");
  }

  // Set explicit content-type for common cases
  if (safeName.endsWith(".json")) res.type("application/json");
  if (safeName.endsWith(".yaml") || safeName.endsWith(".yml")) res.type("text/yaml");

  return res.sendFile(filePath, (err) => {
    if (err) {
      console.error("❌ [.well-known regex] send error:", err.message);
      res.status(500).send("Send error");
    }
  });
});

console.log("✅ .well-known bound to:", wellKnownAbsolute);

// also expose everything under /public normally
const staticDir = path.resolve(__dirname, "public");
app.use(express.static(staticDir));
console.log("✅ Static assets served from absolute path:", staticDir);

// ---------------------------------------------------------------------------

const { loadLanguages } = require("./src/brain/utils/langLoader");
(async () => {
  global.__LANG_REGISTRY__ = await loadLanguages();
  console.log("🌐 Loaded", Object.keys(global.__LANG_REGISTRY__).length, "languages globally");
})();

// Enable middleware globally
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// ============================================================
// === Static File Hosting for Dashboards (Story 10.3) ===
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));
console.log("✅ Static dashboards served from:", publicPath);

// ============================================================
// === Story 10.9 – Partner Legal & Compliance Automation ===
try {
  const partnerLegal = require("./src/routes/partnerLegal");
  app.use("/api", partnerLegal);
  console.log("✅ Mounted /api/partner/legal routes (Story 10.9)");
} catch (err) {
  console.warn("⚠️ partnerLegal routes not loaded:", err.message);
}

// ============================================================
// 🏦 Story 10.10 — Global Partner Payout Gateway
// ============================================================
// Added redundancy check to ensure route loads only once
// ============================================================
// 🏦 Story 10.10 — Global Partner Payout Gateway (Debug Mode)
// ============================================================
try {
  const partnerPayout = require("./src/routes/partnerPayout");

  // 🔍 Detailed introspection
  console.log("🧩 partnerPayout require result type:", typeof partnerPayout);
  console.log("🧩 partnerPayout keys:", partnerPayout ? Object.keys(partnerPayout) : "undefined or null");

  app.use("/api", partnerPayout);
  console.log("✅ Mounted /api/partner/payout routes (Story 10.10)");
} catch (err) {
  console.warn("⚠️ partnerPayout routes not loaded (stack trace below):");
  console.error(err);
}


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
// 🪙 Story 10.2 — Partner Onboarding & Reward Referral Engine
// ============================================================
try {
  const partnerRoutes = require("./src/routes/partner");
  app.use("/partner", partnerRoutes);
  console.log("✅ Mounted /partner routes (Story 10.2)");
} catch (err) {
  console.warn("⚠️ partnerRoutes not loaded:", err.message);
}

// ============================================================
// 📊 Story 10.3 — Partner Dashboard & Reward Analytics UI
// ============================================================
try {
  const partnerDashboardRoutes = require("./src/routes/partnerDashboard");
  app.use("/partner", partnerDashboardRoutes);
  console.log("✅ Mounted /partner dashboard routes (Story 10.3)");
} catch (err) {
  console.warn("⚠️ partnerDashboard routes not loaded:", err.message);
}

// ============================================================
// 🏆 Story 10.4 — Partner Leaderboard & Reward Payout System
// ============================================================
try {
  const partnerLeaderboard = require("./src/routes/partnerLeaderboard");
  app.use("/", partnerLeaderboard);
  console.log("✅ Mounted /partnerLeaderboard routes (Story 10.4)");
} catch (err) {
  console.warn("⚠️ partnerLeaderboard routes not loaded:", err.message);
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
try {
  const brainRoutes = require("./src/routes/brain");
  app.use("/brain", brainRoutes);
  console.log("✅ Mounted /brain routes for global matrix test");
} catch (err) {
  console.warn("⚠️ brainRoutes not loaded:", err.message);
}


try {
  const partnerPayout = require("./src/routes/partnerPayout");   // capital P here ⬅️
  app.use("/api", partnerPayout);
  console.log("✅ Mounted /api/partner/payout routes (Story 10.10)");
} catch (err) {
  console.warn("⚠️ partnerPayout routes not loaded:", err.message);
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
    if (FORCE_LANG) {
      langCode = FORCE_LANG;
      console.log("🔒 FORCE_LANG applied:", langCode);
    } else {
      if (await detectTamilSmart(transcript)) {
        langCode = "ta-IN";
        console.log("🔄 Tanglish/Tamil override triggered →", langCode);
      }

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

      if (!FORCE_LANG && sessionLang && sessionLang !== "en-US") {
        console.log("🔁 Using sessionLang override:", sessionLang);
        langCode = sessionLang;
      }
    }

    console.log("➡️ Final decision: langCode =", langCode, "| sessionLang =", sessionLang);

    const answer = await retrieveAnswer(transcript, businessId, langCode);
    console.log("📋 Retrieved/polished answer:", answer);

    // Step 6: Synthesize speech
    console.log("🔈 Sending to TTS with langCode:", langCode);
    const audioBuffer = await synthesizeSpeech(answer, langCode);

    ws.send(JSON.stringify({
      event: "media",
      media: { payload: audioBuffer.toString("base64") }
    }));

    sessionLang = langCode;
    console.log("✅ Spoke in", langCode);

  } catch (err) {
    console.error("❌ Error in onFinalTranscript:", err);
    ws.send(JSON.stringify({
      event: "media",
      media: { payload: Buffer.from('Sorry, something went wrong.').toString('base64') }
    }));
  }
}

module.exports = { onSTTResponse, onStreamEnd };
