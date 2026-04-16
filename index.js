// index.js – Orchestrator with Tanglish detection + debug logging
console.log("🧭 process.cwd():", process.cwd());
console.log("🧭 __dirname:", __dirname);

const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const { safeRequire } = require("./src/brain/utils/safeRequire");
const jwt = require("jsonwebtoken");

// ✅ Force-load orchestrator-level .env (absolute path) — MUST BE FIRST
const dotenvPath = path.resolve(__dirname, "./.env");
console.log("🧩 index.js loading .env from:", dotenvPath);
const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
require("dotenv").config({ path: dotenvPath, override: !isProd });

// ========================================================
// 🔐 FINAL SECURITY: ENV VALIDATION (Story 12.8)
// ========================================================
const REQUIRED_ENV = [
  "OPENAI_API_KEY",
  "DATABASE_URL",
  "JWT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env: ${key}`);
    process.exit(1); // HARD STOP
  }
}

console.log("🔐 Env validation passed");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const { retrieveAnswer } = require("./retriever");
const { synthesizeSpeech } = require("./tts");
// const { bindWebSocket } = require("./socket_handler");
// ✅ Story 12.6 fix: DO NOT load socket_handler here.
// Reason: any raw ws.Server() / upgrade listeners inside socket_handler (even as side-effects) can intercept
// WebSocket upgrades intended for express-ws route /ws/chat, causing the UI to stay stuck on "connecting…".

const chatRoute = require("./src/routes/chat");

// Demo mode route
const demoRouter = require("./src/routes/demo");

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

// ---------------------------------------------------------------------------
// ✅ Story 12.x — Robust session memory wiring (prevents startup crashes)
// ---------------------------------------------------------------------------
const memA = safeRequire("./src/brain/memory/sessionMemory", "memory/sessionMemory") || {};
const memB = safeRequire("./src/brain/utils/sessionMemory", "utils/sessionMemory") || {};
const mem = Object.keys(memA).length ? memA : memB;

// Normalize function names across variants (ONLY accept real functions to prevent TypeError)
const loadSession =
  (typeof mem.loadSession === "function" && mem.loadSession) ||
  (typeof mem.load === "function" && mem.load) ||
  (typeof mem.restore === "function" && mem.restore) ||
  (typeof mem.loadState === "function" && mem.loadState) ||
  null;

const saveSession =
  (typeof mem.saveSession === "function" && mem.saveSession) ||
  (typeof mem.save === "function" && mem.save) ||
  (typeof mem.persist === "function" && mem.persist) ||
  (typeof mem.saveState === "function" && mem.saveState) ||
  null;

// Some builds expose pruneExpired, others expose prune/cleanup
const pruneExpired =
  (typeof mem.pruneExpired === "function" && mem.pruneExpired) ||
  (typeof mem.prune === "function" && mem.prune) ||
  (typeof mem.cleanup === "function" && mem.cleanup) ||
  (typeof mem.gc === "function" && mem.gc) ||
  null;

// Optional "recovery marker" (some older variants had this)
const markRecovery = mem.markRecovery || global.markRecovery || null;
// ---------------------------------------------------------------------------

const rm = safeRequire("./src/monitor/resilienceMetrics", "resilienceMetrics") || {};
const { observeHttpRetry } = rm;
// Ensure /monitor/resilience never crashes if metrics module is absent
const getMetricsText =
  typeof rm.getMetricsText === "function" ? rm.getMetricsText : () => "";

// ✅ Story 12.7 — Session memory store (tenant/session isolated) + TTL pruning
let memory = null;
try {
  memory = require("./src/brain/memory/sessionMemory");
  console.log("✅ Story 12.7 memory store loaded (sessionMemory.js)");

  // Periodic TTL prune (keeps memory bounded; safe even on Render)
  // NOTE: This does NOT store anything to disk.
  setInterval(() => {
    try {
      // Prefer memory.pruneExpired if present; fallback to normalized pruneExpired
      const fn =
        typeof memory.pruneExpired === "function"
          ? memory.pruneExpired
          : typeof pruneExpired === "function"
          ? pruneExpired
          : null;

      if (fn) {
        fn({
          ttlMs: parseInt(process.env.MEMORY_TTL_MS || "3600000", 10), // default 60 min
        });
      }
    } catch (e) {}
  }, 5 * 60 * 1000).unref(); // every 5 minutes
} catch (err) {
  console.warn("⚠️ Story 12.7 memory store not loaded:", err.message);
}

// Global in-memory session placeholder (align with your actual objects)
global.__ACA_STATE__ = { activeSessions: [], version: "5.3.A" };

// Restore on boot
let prior = null;
try {
  prior = typeof loadSession === "function" ? loadSession() : null;
} catch (e) {
  console.warn("⚠️ loadSession failed (non-fatal):", e && e.message ? e.message : String(e));
  prior = null;
}

if (prior && prior.activeSessions) {
  global.__ACA_STATE__.__proto__ = global.__ACA_STATE__.__proto__;
  global.__ACA_STATE__.activeSessions = prior.activeSessions;
  if (typeof markRecovery === "function") markRecovery();
  console.log("♻️  Restored session state:", prior.activeSessions.length, "items");
}

// Graceful snapshot on shutdown/crash
process.on("SIGINT", () => {
  try {
    if (typeof saveSession === "function") saveSession(global.__ACA_STATE__);
  } finally {
    process.exit(0);
  }
});
process.on("uncaughtException", (err) => {
  console.error(err);
  try {
    if (typeof saveSession === "function") saveSession(global.__ACA_STATE__);
  } catch (e) {}
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error(err);
  try {
    if (typeof saveSession === "function") saveSession(global.__ACA_STATE__);
  } catch (e) {}
  process.exit(1);
});

// ============================================================
// EXPRESS APP INITIALIZATION (required for Render)
const express = require("express");
const http = require("http"); // ✅ Needed so express-ws binds to the same server that listens

const cors = require("cors");
const bodyParser = require("body-parser");
const app = express();

// ✅ Story 12.8 — security headers + origin allowlist guard (fail-closed in prod)
try {
  const { securityHeaders } = require("./src/brain/utils/securityHeaders");
  app.disable("x-powered-by");
  app.use(securityHeaders({ isProd }));
  console.log("✅ Story 12.8 securityHeaders enabled");
} catch (e) {
  console.warn("⚠️ Story 12.8 securityHeaders not loaded:", e && e.message ? e.message : String(e));
}

// ✅ Story 12.8 — Marketplace Plugin (.well-known) Binding
const wellKnownPath = path.join(__dirname, "public", "wellknown");
app.use("/.well-known", express.static(wellKnownPath));
console.log("✅ .well-known bound to:", wellKnownPath);

// ✅ Story 12.8 — Origin allowlist guard (because app.use(cors()) appears permissive later)
// Secure default: if production and origin is present, it MUST be in ALLOWED_ORIGINS (or RENDER_BASE_URL).
app.use((req, res, next) => {
  try {
    if (!isProd) return next();

    const origin = String(req.headers.origin || "").trim();
    if (!origin) return next(); // non-browser or same-origin fetch with no Origin

    const raw = String(process.env.ALLOWED_ORIGINS || "").trim();
    const allow = raw.split(",").map((s) => s.trim()).filter(Boolean);

    const renderBase = String(process.env.RENDER_BASE_URL || "").trim();
    if (renderBase && !allow.includes(renderBase)) allow.push(renderBase);

    if (allow.length && allow.includes(origin)) return next();

    // Fail closed for browser cross-origin
    return res.status(403).send("Forbidden");
  } catch (e) {
    // Fail-open to avoid prod crash due to guard bug
    return next();
  }
});

// ✅ Story 12.8 — protect monitoring/admin-only endpoints
function requireAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const token = auth.slice(7).trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (String(decoded?.role || "").toLowerCase() !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
}

function createRateLimiter({ windowMs, max, keyFn }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of hits.entries()) {
      if (now - value.windowStart >= windowMs) {
        hits.delete(key);
      }
    }
  }, Math.max(30000, windowMs)).unref();

  return function rateLimit(req, res, next) {
    try {
      const key = keyFn ? keyFn(req) : req.ip || "unknown";
      const now = Date.now();

      const existing = hits.get(key);
      if (!existing || now - existing.windowStart >= windowMs) {
        hits.set(key, { count: 1, windowStart: now });
        return next();
      }

      existing.count += 1;

      if (existing.count > max) {
        return res.status(429).json({
          ok: false,
          error: "rate_limited",
        });
      }

      return next();
    } catch (err) {
      console.warn("⚠️ rate limiter error:", err.message);
      return next();
    }
  };
}

const publicRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyFn: (req) => req.ip || "unknown",
});

const demoRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyFn: (req) => {
    const auth = req.headers.authorization || "";
    return `${req.ip || "unknown"}:${auth.slice(0, 80)}`;
  },
});

const authRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyFn: (req) => {
    const auth = req.headers.authorization || "";
    return `${req.ip || "unknown"}:${auth.slice(0, 80)}`;
  },
});

// ✅ Story 12.5/12.6 — Create HTTP server EARLY so express-ws binds correctly
// (This fixes “connecting…” in chat UI because WS upgrades now hit the right server.)
const server = http.createServer(app);

// ✅ Optional compression (Render-safe). If not installed, we continue without it.
let compression = null;
try {
  compression = require("compression");
  console.log("✅ compression middleware loaded");
} catch (err) {
  console.warn("⚠️ compression not installed; continuing without compression:", err.message);
}

// ✅ Story 12.5 — Apply CORS early (SSE-friendly ordering; safe even if repeated later)
app.use(cors());
app.use("/api/demo", demoRateLimit);
app.use("/api/chat", authRateLimit);
app.use("/api/billing", authRateLimit);
app.use("/brain", authRateLimit);
app.use("/partner/register", publicRateLimit);
app.use("/public/login", publicRateLimit);
app.use("/public/signup", publicRateLimit);

app.use("/api/demo", demoRouter);

// Story 12.5 — SSE must not be compressed/buffered (Render/proxy safe)
// Only apply if compression is available.
if (compression) {
  app.use(
    compression({
      filter: (req, res) => {
        try {
          const p = req.originalUrl || req.url || "";
          const accept = String(req.headers?.accept || "");

          // ✅ Never compress SSE
          if (p.startsWith("/api/chat/stream")) return false;
          if (accept.includes("text/event-stream")) return false;
        } catch (e) {}

        return compression.filter(req, res);
      },
    })
  );
}

// ✅ FIX (Story 12.3): app must exist before any app.use(...)
app.use(express.json({ limit: "1mb" }));

app.post("/api/gpt/chat", async (req, res) => {
  try {
    const rawMessage = req.body?.message;
    const message = typeof rawMessage === "string" ? rawMessage.trim() : "";

    if (!message) {
      return res.status(400).json({
        ok: false,
        error: "Message is required",
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        ok: false,
        error: "Message is too long",
      });
    }

    const sessionId = `gpt_demo_${Date.now()}`;

    let result;
    try {
      result = await retrieveAnswer(message, 1, "en-US");
    } catch (innerErr) {
      console.error("❌ /api/gpt/chat retrieveAnswer failed:", innerErr);
      result = null;
    }

    let finalReply =
      typeof result === "string"
        ? result
        : result?.reply ||
          result?.answer ||
          result?.text ||
          result?.message ||
          "";

    const resultSource =
      typeof result === "object" && result?.source ? result.source : "brain";

    const looksLikeErrorReply =
      !finalReply ||
      resultSource === "error" ||
      /temporary issue|try again|knowledge base|something went wrong/i.test(finalReply);

    if (looksLikeErrorReply) {
      finalReply =
        "Alphine AI helps businesses automate customer conversations such as answering service questions, handling booking inquiries, guiding customers through offerings, and supporting real-world call workflows.";
    }

    return res.status(200).json({
      ok: true,
      reply: finalReply,
      session_id: sessionId,
      source: looksLikeErrorReply ? "brain" : resultSource,
    });
  } catch (err) {
    console.error("❌ /api/gpt/chat error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
    });
  }
});

// ✅ Initialize express-ws so WebSocket routes actually work
try {
  require("express-ws")(app, server); // ✅ bind to the real listening server
  console.log("✅ express-ws WebSocket support initialized");
} catch (err) {
  console.warn("⚠️ express-ws init failed:", err.message);
}

// Story 12.5 — WebSocket streaming chat (Render-safe alternative to SSE)
try {
  const { registerChatWs } = require("./src/routes/chat_ws");
  registerChatWs(app);
  console.log("✅ Mounted WebSocket streaming route at /ws/chat (Story 12.5)");
} catch (err) {
  console.warn("⚠️ chat_ws not loaded:", err.message);
}

// ✅ Global JSON parse error handler (prevents noisy stack traces)
// If any request sends invalid JSON with Content-Type: application/json,
// Express/body-parser throws SyntaxError. Catch and return 400 cleanly.
app.use((err, req, res, next) => {
  const isJsonSyntax =
    err &&
    err instanceof SyntaxError &&
    typeof err.message === "string" &&
    err.message.toLowerCase().includes("json");

  if (isJsonSyntax) {
    console.warn("⚠️ Invalid JSON received:", {
      path: req.originalUrl || req.url,
      method: req.method,
      ip: req.ip,
      contentType: req.headers["content-type"],
    });
    return res.status(400).send("Bad Request");
  }

  return next(err);
});

// Story 12.5 — streaming web chat route
const chatStreamRoute = require("./src/routes/chat_stream");
app.use("/api", chatStreamRoute);

// ✅ Story 12.7 — Memory Debug Endpoint (tenant-scoped)
try {
  app.use("/api", require("./src/routes/memoryDebug"));
  console.log("✅ Mounted /api/chat/debug-memory (Story 12.7)");
} catch (err) {
  console.warn("⚠️ memoryDebug route not loaded:", err.message);
}

// Trust Render proxy and log runtime roots once
app.set("trust proxy", 1);
console.log("🧭 process.cwd():", process.cwd());
console.log("🧭 __dirname:", __dirname);

const twilioRouter = require("./src/routes/twilio");
app.use("/twilio", twilioRouter);
console.log("✅ Mounted /twilio routes");

// Story 12.4 — Explicit assets mount (Render/Linux path-safe)
app.use(
  "/dashboard/assets",
  express.static(path.join(__dirname, "public", "dashboard", "assets"))
);
console.log(
  "✅ Dashboard assets served from:",
  path.join(__dirname, "public", "dashboard", "assets")
);

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

// Stripe Webhook Route (Story 11.6)
app.use("/api/stripe", require("./src/routes/stripeWebhook"));

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
try {
  const partnerPayout = require("./src/routes/partnerPayout");

  // 🔍 Detailed introspection
  console.log("🧩 partnerPayout require result type:", typeof partnerPayout);
  console.log(
    "🧩 partnerPayout keys:",
    partnerPayout ? Object.keys(partnerPayout) : "undefined or null"
  );

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

// ✅ Story 12.8 — Marketplace-friendly health check
app.get("/health", (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.status(200).json({
      ok: true,
      service: "ACA-Orchestrator",
      environment: process.env.NODE_ENV || "production",
      ts: new Date().toISOString(),
    });
  } catch (e) {
    res.status(200).json({ ok: true });
  }
});

app.get("/monitor/resilience", requireAdmin, (req, res) => {
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

const voiceRouter = require("./src/routes/voice");
app.use("/api/voice", voiceRouter);

app.use("/api/chat", chatRoute);

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
  console.warn("⚠️ partnerLeaderboard not loaded:", err.message);
}

// ============================================================
// === Story 9.6 — Global Matrix Health Endpoint ===
// ============================================================
app.get("/monitor/deploy-matrix", requireAdmin, async (req, res) => {
  try {
    const dashboardUrl =
      process.env.DASHBOARD_URL || "https://alphine-dashboard.vercel.app";
    const backendUrl =
      process.env.RENDER_BASE_URL || "https://aca-realtime-gateway-clean.onrender.com";
    const supported = (
      process.env.SUPPORTED_LANGUAGES_GLOBAL || "en,ta,es,fr,hi"
    ).split(",");

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
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ============================================================
// === Knowledge Brain Query Route (for test_multilang.ps1) ===
try {
  const path = require("path");
  const brainRoutes = require(path.join(__dirname, "src", "routes", "brain.js"));
  app.use("/brain", brainRoutes);
  console.log("✅ Mounted /brain routes for global matrix test");
} catch (err) {
  console.warn("⚠️ brainRoutes not loaded:", err.message);
}

app.use("/api/billing", require("./src/routes/billing"));

// Enable middleware globally
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// --- Safe Diagnostic: list all mounted routes (Express 4/5 compatible) ---
function listRoutes(app) {
  try {
    const paths = [];

    const stack = app && app._router && Array.isArray(app._router.stack) ? app._router.stack : null;
    if (!stack) {
      console.warn("⚠️ Route-list diagnostic skipped: app._router.stack not available");
      return;
    }

    stack.forEach((layer) => {
      if (layer.route && layer.route.path) {
        paths.push(layer.route.path);
      } else if (layer.name === "router" && Array.isArray(layer.handle?.stack)) {
        layer.handle.stack.forEach((inner) => {
          if (inner.route && inner.route.path) paths.push(inner.route.path);
        });
      }
    });
    console.log("📋 Mounted routes:", JSON.stringify(paths, null, 2));
  } catch (e) {
    console.error("🟥 Route-list diagnostic failed:", e);
  }
}
listRoutes(app);

// ============================================================
// === Server Start ===
const PORT = process.env.PORT || 8080;

// ✅ IMPORTANT: use server.listen (not app.listen) so express-ws works on the same server
server.listen(PORT, () => {
  console.log(`🧠 Orchestrator live on port ${PORT}`);
});

// NOTE: We intentionally do NOT call bindWebSocket(server) here.
// It can intercept upgrades intended for /ws/chat (Story 12.5).
// Story 12.6 hardening will be applied inside the /ws/chat route file next.

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
    "epo",
    "epoo",
    "epdi",
    "sapadu",
    "saapadu",
    "iruka",
    "irukka",
    "unga",
    "ungal",
    "illai",
    "seri",
    "aama",
    "amma",
    "appa",
    "open aa",
    "close aa",
  ];
  if (phoneticHints.some((h) => transcript.toLowerCase().includes(h))) {
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
          content:
            "Detect if this text is Tamil (Tanglish) even if written in English letters. Reply only 'ta-IN' or 'en-US'.",
        },
        { role: "user", content: transcript },
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
        content:
          "Detect the language of this text. Reply only with a BCP-47 code (en-US, hi-IN, es-ES, ta-IN).",
      },
      { role: "user", content: transcript },
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
  console.log(
    "🛠 onFinalTranscript called with transcript:",
    transcript,
    "incoming langCode:",
    langCode
  );

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

    ws.send(
      JSON.stringify({
        event: "media",
        media: { payload: audioBuffer.toString("base64") },
      })
    );

    sessionLang = langCode;
    console.log("✅ Spoke in", langCode);
  } catch (err) {
    console.error("❌ Error in onFinalTranscript:", err);
    ws.send(
      JSON.stringify({
        event: "media",
        media: {
          payload: Buffer.from("Sorry, something went wrong.").toString("base64"),
        },
      })
    );
  }
}

module.exports = { onSTTResponse, onStreamEnd };