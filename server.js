// ================================
// server.js - ACA Realtime Gateway
// Stable version with session memory + Tanglish + voice mapping
// + Story 2.7 — Multi-Business Brain Routing
// + Story 2.12 — Analytics Summary API
// + Story 3.2 — Order Flow Orchestrator Routes
// + Epic 4 Final — Unified Monitoring, Alerts, Auto-Recovery & Admin Controls
// ================================

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");
const dotenv = require("dotenv");

// 🆕 Story 4.x — Alert Manager for Health Checks
const { sendAlert } = require("./src/monitor/alertManager");

dotenv.config();

// --- Google STT Client ---
const speech = require("@google-cloud/speech");
const speechClient = new speech.SpeechClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

// --- OpenAI Client ---
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Database Client ---
const { Pool } = require("pg");

// ✅ Dynamic SSL: local (no SSL), Heroku (SSL, no CA verify)
const pgSSL =
  process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: pgSSL,
});

// Optional: quick startup connectivity test for clearer logs
(async () => {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    console.log("🌐 Connected to Postgres successfully (startup test)");
  } catch (err) {
    console.error("❌ Startup connection failed:", err.message);
    try {
      sendAlert("Database", `Startup connection failed: ${err.message}`);
    } catch (_) {}
  }
})();

// --- Express App (declare before using) ---
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.json());

// ============================================
// 🧩 Step 5.1 — Secure CORS + HTTPS Enforcement
// ============================================

const cors = require("cors");

// ✅ Restrict requests only to approved production origins
app.use(
  cors({
    origin: [
      "https://alphineai.com",
      "https://app.alphineai.com",
      "https://chat.openai.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// ✅ Reduce fingerprinting exposure
//app.options("*", (req, res) => res.sendStatus(204));

// ✅ Enforce HTTPS when behind reverse proxy (e.g., ngrok / Vercel)
app.use((req, res, next) => {
  const proto = req.headers["x-forwarded-proto"];
  if (proto && proto !== "https") {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// ============================================
// ROUTES
// ============================================

// --- Brain Routes (Knowledge Retrieval + Analytics Dashboard) ---
const brainRoutes = require("./src/brain/routes");
console.log("👉 brainRoutes loaded from:", require.resolve("./src/brain/routes"));
app.use("/brain", brainRoutes);

// ============================================
// 🧠 Unified Dashboard Routes (Epic 4 Final)
// ============================================

// Serve all dashboard UIs (system.html, alerts.html, recovery.html, etc.)
app.use(
  "/dashboard",
  express.static(
    path.join(__dirname, "aca-orchestrator/public/dashboard"),
    { index: "index.html" }
  )
);

// ============================================
// Monitoring Routes (Health, Alerts, Recovery APIs)
// ============================================
const monitorRoutes = require("./src/monitor/monitorRoutes");
app.use("/monitor", monitorRoutes);

// ============================================
// Orchestrator Proxy Routes (Story 3.2)
// ============================================
app.post("/orchestrator/order/intent", async (req, res) => {
  try {
    const response = await axios.post(
      "http://localhost:8081/brain/order/intent",
      req.body
    );
    res.json(response.data);
  } catch (err) {
    console.error("❌ Proxy error:", err.message);
    res
      .status(500)
      .json({ error: "Proxy to orchestrator failed", details: err.message });
  }
});

// ============================================
// TWILIO VOICE HANDLER
// ============================================
app.post("/twilio/voice", async (req, res) => {
  try {
    const toNumber = req.body.To || req.body.Called;
    console.log("📞 Incoming call to:", toNumber);

    const { rows } = await pool.query(
      "SELECT business_id FROM call_map WHERE phone_number = $1 LIMIT 1",
      [toNumber]
    );
    const businessId = rows.length ? rows[0].business_id : 1;
    console.log(`🏢 Routing call to business_id=${businessId}`);

    const twiml = `
      <Response>
        <Connect>
          <Stream url="wss://${process.env.NGROK_HOST}/media-stream">
            <Parameter name="secret" value="${process.env.WS_SHARED_SECRET}" />
            <Parameter name="business_id" value="${businessId}" />
          </Stream>
        </Connect>
      </Response>
    `;

    console.log("📤 Sending TwiML:", twiml);
    res.type("text/xml").send(twiml);
  } catch (err) {
    console.error("❌ Error in /twilio/voice:", err);
    sendAlert("Twilio", `Voice handler failed: ${err.message}`);
    res.status(500).send("Internal server error");
  }
});

// ============================================
// WEBSOCKET: Twilio ↔ STT ↔ OpenAI ↔ ElevenLabs
// ============================================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const sessions = new Map();
const SYSTEM_PROMPT = [
  "You are Alphine AI's on-call voice assistant.",
  "Be concise, friendly, and helpful.",
  "Confirm key details briefly and stay natural.",
].join(" ");

function startSession(streamSid) {
  sessions.set(streamSid, {
    messages: [{ role: "system", content: SYSTEM_PROMPT }],
    turns: 0,
    createdAt: Date.now(),
  });
}
function appendUser(streamSid, text) {
  const s = sessions.get(streamSid);
  if (s) s.messages.push({ role: "user", content: text });
  trimMessages(s);
}
function appendAssistant(streamSid, text) {
  const s = sessions.get(streamSid);
  if (!s) return;
  s.messages.push({ role: "assistant", content: text });
  s.turns += 1;
  trimMessages(s);
}
function trimMessages(s) {
  if (!s) return;
  const MAX_MESSAGES = 13;
  if (s.messages.length > MAX_MESSAGES) {
    const system = s.messages[0];
    const recent = s.messages.slice(-(MAX_MESSAGES - 1));
    s.messages = [system, ...recent];
  }
}
function endSession(streamSid) {
  sessions.delete(streamSid);
}

// ---------- WebSocket Processing ----------
wss.on("connection", (ws) => {
  console.log("🔌 New WebSocket connection from Twilio.");
  let authorized = false;
  let streamSid = null;
  let recognizeStream = null;

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.event === "start") {
      const custom = data.start.customParameters || {};
      streamSid = data.start.streamSid;

      const incomingSecret = (custom.secret || "").trim();
      const expectedSecret = (process.env.WS_SHARED_SECRET || "").trim();
      if (incomingSecret !== expectedSecret) {
        console.error("❌ Unauthorized WebSocket (bad secret)");
        sendAlert("WebSocket", "Unauthorized connection attempt");
        ws.close();
        return;
      }

      ws.business_id = custom.business_id || 1;
      authorized = true;
      startSession(streamSid);
      console.log("✅ Authorized Twilio WebSocket");

      const requestConfig = {
        config: {
          encoding: "MULAW",
          sampleRateHertz: 8000,
          languageCode: "en-US",
          alternativeLanguageCodes: ["ta-IN"],
        },
        interimResults: true,
      };

      recognizeStream = speechClient
        .streamingRecognize(requestConfig)
        .on("error", (err) => {
          console.error("Google STT Error:", err);
          sendAlert("GoogleSTT", `STT error: ${err.message}`);
        })
        .on("data", async (sttData) => {
          const result = sttData.results[0];
          if (!result) return;

          if (result.isFinal) {
            const transcript = result.alternatives[0]?.transcript?.trim();
            if (transcript) {
              console.log("📝 Final Transcript:", transcript);
              appendUser(streamSid, transcript);

              const aiReply = await generateAIReplyWithMemory(streamSid);
              if (aiReply) {
                console.log("🤖 AI Reply:", aiReply);
                appendAssistant(streamSid, aiReply);
                const audioBuffer = await speakAIReplyElevenLabs(aiReply);
                if (audioBuffer) sendAudioToTwilio(ws, streamSid, audioBuffer);
              }
            }
          }
        });
    } else if (data.event === "media" && authorized && data.media?.payload) {
      const audio = Buffer.from(data.media.payload, "base64");
      recognizeStream?.write(audio);
    } else if (data.event === "stop") {
      console.log("🛑 Twilio stream stopped.");
      recognizeStream?.destroy();
      if (streamSid) endSession(streamSid);
    }
  });

  ws.on("close", () => {
    console.log("🔌 Twilio WebSocket disconnected.");
    recognizeStream?.destroy();
  });

  ws.on("error", (err) => {
    console.error("❌ WebSocket error:", err);
    sendAlert("WebSocket", `Runtime error: ${err.message}`);
  });
});

// ============================================
// OPENAI WITH SESSION MEMORY
// ============================================
async function generateAIReplyWithMemory(streamSid) {
  const session = sessions.get(streamSid);
  if (!session) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: session.messages,
      temperature: 0.4,
      max_tokens: 120,
    });
    return (
      completion.choices[0]?.message?.content?.trim() ||
      "Could you repeat that, please?"
    );
  } catch (err) {
    console.error("OpenAI Error:", err);
    sendAlert("OpenAI", `Chat error: ${err.message}`);
    return "Sorry, I had trouble processing that.";
  }
}

// ============================================
// ELEVENLABS VOICE SYNTHESIS
// ============================================
async function speakAIReplyElevenLabs(text) {
  try {
    const lang = (process.env.FORCE_LANG || "en").toLowerCase();
    const voiceId =
      process.env[`ELEVENLABS_VOICE_${lang.toUpperCase()}`] ||
      process.env.ELEVENLABS_VOICE_EN;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=ulaw_8000`;

    const response = await axios.post(
      url,
      { text },
      {
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      }
    );
    return Buffer.from(response.data);
  } catch (err) {
    console.error("ElevenLabs TTS Error:", err.response?.data || err.message);
    sendAlert("ElevenLabs", `TTS failed: ${err.message}`);
    return null;
  }
}

// ============================================
// SEND AUDIO TO TWILIO
// ============================================
function sendAudioToTwilio(ws, streamSid, audioBuffer) {
  if (!streamSid) return;
  const base64Chunk = audioBuffer.toString("base64");
  ws.send(
    JSON.stringify({
      event: "media",
      streamSid,
      media: { track: "outbound", payload: base64Chunk },
    })
  );
  console.log("🔊 Sent AI voice reply to caller.");
}

// ============================================
// 🩺 Periodic Health Poller
// ============================================
const CHECK_INTERVAL = 60 * 1000;

async function runHealthCheck() {
  console.log("🔍 Running periodic health check...");
  try {
    const res = await axios.get(`http://localhost:${PORT}/monitor/health`);
    if (!res.data.ok) throw new Error("Monitor health failed");
  } catch (err) {
    sendAlert("Monitor", `Health check failed: ${err.message}`);
  }

  if (!process.env.DATABASE_URL) {
    sendAlert("Database", "DATABASE_URL not set in environment");
  }

  if (wss.clients.size === 0) {
    console.log("♻️ WebSocket has no active clients — idle state.");
  }
}
setInterval(runHealthCheck, CHECK_INTERVAL);

// ============================================
// START SERVER (Heroku-compatible port binding)
// ============================================
const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 NGROK_HOST from .env: ${process.env.NGROK_HOST}`);
});
