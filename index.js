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
    `\n[${new Date().toISOString()}] Deployment started for ${
      process.env.NODE_ENV || "production"
    }`
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

// ---------------------------------------------------------------------------
// ✅ Marketplace-safe short-term session continuity for /api/gpt/chat
// Minimal additive layer only; no DB persistence; Render-safe ephemeral memory
// ---------------------------------------------------------------------------
const GPT_CHAT_SESSION_TTL_MS = parseInt(
  process.env.GPT_CHAT_SESSION_TTL_MS || "1200000",
  10
); // 20 min
const GPT_CHAT_SESSION_SWEEP_MS = parseInt(
  process.env.GPT_CHAT_SESSION_SWEEP_MS || "300000",
  10
); // 5 min
const GPT_CHAT_SESSION_MAX_HISTORY = parseInt(
  process.env.GPT_CHAT_SESSION_MAX_HISTORY || "8",
  10
);

const gptChatSessions = new Map();

function safeGptChatSessionId(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return raw.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 128) || null;
}

function normalizeBusinessType(value) {
  const raw = String(value || "").trim().toLowerCase();

  const allowed = new Set([
    "restaurant",
    "hotel",
    "hospital_clinic",
    "salon_spa",
    "office_business",
    "resort_travel",
    "local_service",
    "support_center",
    "generic",
  ]);

  if (allowed.has(raw)) return raw;
  return null;
}

function getOrCreateGptChatSession(sessionId) {
  const id = safeGptChatSessionId(sessionId);
  if (!id) return null;

  const now = Date.now();
  const existing = gptChatSessions.get(id);

  if (existing && existing.expires_at > now) {
    existing.last_seen_at = now;
    existing.expires_at = now + GPT_CHAT_SESSION_TTL_MS;
    return existing;
  }

  const fresh = {
    session_id: id,
    scenario: null,
    business_type: null,
    tenant_business_type: null,
    last_intent: null,
    slots: {},
    history: [],
    last_seen_at: now,
    expires_at: now + GPT_CHAT_SESSION_TTL_MS,
  };

  gptChatSessions.set(id, fresh);
  return fresh;
}

function pruneGptChatSessions() {
  const now = Date.now();
  for (const [id, session] of gptChatSessions.entries()) {
    if (!session || session.expires_at <= now) {
      gptChatSessions.delete(id);
    }
  }
}

setInterval(pruneGptChatSessions, GPT_CHAT_SESSION_SWEEP_MS).unref();

function pushGptChatHistory(session, role, content) {
  if (!session || !role || !content) return;
  session.history.push({
    role,
    content: String(content).trim().slice(0, 500),
  });
  if (session.history.length > GPT_CHAT_SESSION_MAX_HISTORY) {
    session.history = session.history.slice(-GPT_CHAT_SESSION_MAX_HISTORY);
  }
}

function setGptChatSlot(session, key, value) {
  if (!session || !key) return;
  if (value === undefined || value === null) return;

  const clean = String(value).trim();
  if (!clean) return;

  session.slots[key] = clean.slice(0, 120);
}

function detectGptChatScenarioFromText(text) {
  const t = String(text || "").toLowerCase();

  if (
    t.includes("table") ||
    t.includes("reservation") ||
    t.includes("book a table") ||
    t.includes("restaurant") ||
    t.includes("dinner") ||
    t.includes("lunch")
  ) {
    return { scenario: "restaurant_reservation", intent: "book_table" };
  }

  if (
    t.includes("room") ||
    t.includes("hotel") ||
    t.includes("stay") ||
    t.includes("check-in") ||
    t.includes("check in") ||
    t.includes("booking a room")
  ) {
    return { scenario: "hotel_booking", intent: "book_room" };
  }

  if (
    t.includes("issue") ||
    t.includes("problem") ||
    t.includes("help") ||
    t.includes("support") ||
    t.includes("not working") ||
    t.includes("complaint")
  ) {
    return { scenario: "customer_support", intent: "support_request" };
  }

  // ✅ Generic service / appointment / scheduling fallback
  if (
    t.includes("appointment") ||
    t.includes("schedule") ||
    t.includes("meeting") ||
    t.includes("service") ||
    t.includes("consultation") ||
    t.includes("visit") ||
    t.includes("book") ||
    t.includes("reserve")
  ) {
    return { scenario: "generic_service", intent: "service_request" };
  }

  return { scenario: null, intent: null };
}

function detectBusinessTypeFromText(text) {
  const t = String(text || "").toLowerCase();

  if (
    t.includes("restaurant") ||
    t.includes("table") ||
    t.includes("dinner") ||
    t.includes("lunch") ||
    t.includes("menu")
  ) {
    return "restaurant";
  }

  if (
    t.includes("hotel") ||
    t.includes("room") ||
    t.includes("check-in") ||
    t.includes("stay")
  ) {
    return "hotel";
  }

  if (
    t.includes("doctor") ||
    t.includes("hospital") ||
    t.includes("clinic") ||
    t.includes("appointment") ||
    t.includes("medical") ||
    t.includes("patient") ||
    t.includes("consultation")
  ) {
    return "hospital_clinic";
  }

  if (
    t.includes("salon") ||
    t.includes("spa") ||
    t.includes("haircut") ||
    t.includes("massage") ||
    t.includes("facial") ||
    t.includes("stylist") ||
    t.includes("beauty")
  ) {
    return "salon_spa";
  }

  if (
    t.includes("office") ||
    t.includes("meeting") ||
    t.includes("conference") ||
    t.includes("business") ||
    t.includes("discussion") ||
    t.includes("appointment with manager")
  ) {
    return "office_business";
  }

  if (
    t.includes("resort") ||
    t.includes("vacation") ||
    t.includes("holiday") ||
    t.includes("travel") ||
    t.includes("tour") ||
    t.includes("package")
  ) {
    return "resort_travel";
  }

  if (
    t.includes("repair") ||
    t.includes("cleaning") ||
    t.includes("service call") ||
    t.includes("inspection") ||
    t.includes("installation") ||
    t.includes("maintenance")
  ) {
    return "local_service";
  }

  if (
    t.includes("support") ||
    t.includes("issue") ||
    t.includes("problem") ||
    t.includes("complaint")
  ) {
    return "support_center";
  }

  return null;
}

function extractGptChatSlotsFromText(text, scenario) {
  const input = String(text || "").trim();
  const lower = input.toLowerCase();
  const slots = {};

  if (!scenario) return slots;

  // Common count patterns
  const countMatch =
    input.match(/\bfor\s+(\d{1,2})\b/i) ||
    input.match(/\b(\d{1,2})\s+(people|persons|guests|guest)\b/i);

  if (scenario === "restaurant_reservation" && countMatch) {
    slots.party_size = countMatch[1];
  }

  if (scenario === "hotel_booking" && countMatch) {
    slots.guests = countMatch[1];
  }

  if (scenario === "generic_service" && countMatch) {
    slots.participants = countMatch[1];
  }

  // Time
  const timeMatch = input.match(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/i);
  if (
    (scenario === "restaurant_reservation" || scenario === "generic_service") &&
    timeMatch
  ) {
    slots.time = timeMatch[0];
  }

  // Restaurant date-like words
  if (scenario === "restaurant_reservation") {
    if (/\btoday\b/i.test(input)) slots.date = "today";
    if (/\btomorrow\b/i.test(input)) slots.date = "tomorrow";

    const dayMatch = input.match(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
    );
    if (dayMatch) slots.date = dayMatch[1];
  }

  // Generic service date-like words + service extraction
  if (scenario === "generic_service") {
    if (/\btoday\b/i.test(input)) slots.date = "today";
    if (/\btomorrow\b/i.test(input)) slots.date = "tomorrow";

    const dayMatch = input.match(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
    );
    if (dayMatch) slots.date = dayMatch[1];

    const serviceMatch =
      input.match(
        /\b(?:need|want|book|schedule|arrange)\s+(?:a|an)?\s*([a-z][a-z\s-]{2,40})$/i
      ) ||
      input.match(/\bfor\s+(?:a|an)?\s*([a-z][a-z\s-]{2,40})$/i);

    if (serviceMatch) {
      const cleanedService = serviceMatch[1]
        .trim()
        .replace(
          /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
          ""
        )
        .replace(/\b(at|for)\b/gi, "")
        .trim();

      if (cleanedService) {
        slots.service_type = cleanedService.slice(0, 80);
      }
    }

    if (
      input.length >= 12 &&
      !/^(appointment|schedule|meeting|service|book|reserve)$/i.test(input)
    ) {
      slots.notes = input.slice(0, 160);
    }
  }

  // Hotel stay details
  if (scenario === "hotel_booking") {
    if (/\btonight\b/i.test(input)) slots.check_in = "tonight";
    if (/\btomorrow\b/i.test(input)) slots.check_in = "tomorrow";

    const nightsMatch = input.match(/\b(\d{1,2})\s+night[s]?\b/i);
    if (nightsMatch) slots.nights = nightsMatch[1];
  }

  // Support type
  if (scenario === "customer_support") {
    if (lower.includes("refund")) slots.issue_type = "refund";
    else if (lower.includes("cancel")) slots.issue_type = "cancellation";
    else if (lower.includes("billing")) slots.issue_type = "billing";
    else if (lower.includes("login")) slots.issue_type = "login";
    else if (lower.includes("booking")) slots.issue_type = "booking_issue";

    if (
      input.length >= 12 &&
      !/^(help|support|issue|problem)$/i.test(input)
    ) {
      slots.issue_summary = input.slice(0, 160);
    }
  }

  // Name capture
  const nameMatch =
    input.match(/\bmy name is\s+([a-z][a-z .'-]{1,40})$/i) ||
    input.match(/\bunder\s+the\s+name\s+([a-z][a-z .'-]{1,40})$/i) ||
    input.match(/\bunder\s+([a-z][a-z .'-]{1,40})$/i) ||
    input.match(/\bit'?s\s+([a-z][a-z .'-]{1,40})$/i);

  if (nameMatch) {
    slots.name = nameMatch[1].trim();
  }

  return slots;
}

function buildGptChatContextSummary(session) {
  if (!session) return "";

  const parts = [];

  if (session.scenario) parts.push(`scenario=${session.scenario}`);
  if (session.tenant_business_type) {
    parts.push(`tenant_business_type=${session.tenant_business_type}`);
  }
  if (session.business_type) parts.push(`business_type=${session.business_type}`);
  if (session.last_intent) parts.push(`intent=${session.last_intent}`);

  const slotEntries = Object.entries(session.slots || {})
    .filter(([, value]) => !!value)
    .map(([key, value]) => `${key}:${value}`);

  if (slotEntries.length) {
    parts.push(`slots=${slotEntries.join(", ")}`);
  }

  return parts.join(" | ");
}

function buildGptChatFollowUp(session, channel = "chat") {
  if (!session || !session.scenario) return null;

  const isVoice = channel === "voice";

  if (session.scenario === "restaurant_reservation") {
    if (!session.slots.date) {
      return isVoice
        ? "Sure — what day works for the reservation?"
        : "Sure — what day would you like the reservation?";
    }
    if (!session.slots.time) {
      return isVoice
        ? "What time works for the table?"
        : "What time should I note for the table?";
    }
    if (!session.slots.party_size) {
      return "How many people will be joining?";
    }
    if (!session.slots.name) {
      return "Got it. What name should I put on the reservation?";
    }

    return `Thanks, ${session.slots.name} — I’ve noted your request for ${session.slots.date} at ${session.slots.time} for ${session.slots.party_size} people.`;
  }

  if (session.scenario === "hotel_booking") {
    if (!session.slots.check_in) {
      return "Sure — when would you like to check in?";
    }
    if (!session.slots.nights) return "How many nights will you be staying?";
    if (!session.slots.guests) return "How many guests should I note?";
    if (!session.slots.name) return "What name should I place on the booking request?";

    return `Thanks, ${session.slots.name} — I’ve noted your request for check-in ${session.slots.check_in} for ${session.slots.nights} nights for ${session.slots.guests} guests.`;
  }

  if (session.scenario === "customer_support") {
    if (!session.slots.issue_type) {
      return "I can help with that. What seems to be the main issue?";
    }
    if (!session.slots.issue_summary) {
      return "Understood. Could you briefly tell me what happened?";
    }

    return "Thanks — I’ve noted that. Would you like a short summary of the issue?";
  }

  if (session.scenario === "generic_service") {
    if (!session.slots.service_type) {
      if (session.business_type === "hospital_clinic") {
        return "Sure — is this for a doctor visit, consultation, or something else?";
      }

      if (session.business_type === "salon_spa") {
        return "Sure — what service would you like to book?";
      }

      if (session.business_type === "office_business") {
        return "Sure — what kind of meeting or appointment should I note?";
      }

      if (session.business_type === "resort_travel") {
        return "Sure — what kind of reservation or service are you looking for?";
      }

      if (session.business_type === "local_service") {
        return "Sure — what kind of service do you need help arranging?";
      }

      return "Sure — what kind of service would you like to arrange?";
    }

    if (!session.slots.date) {
      if (session.business_type === "hospital_clinic") {
        return "What day would you like to come in?";
      }

      if (session.business_type === "office_business") {
        return "What day should I note for the meeting?";
      }

      return "What day would you like me to note for this?";
    }

    if (!session.slots.time) {
      if (session.business_type === "hospital_clinic") {
        return "What time works best for the appointment?";
      }

      if (session.business_type === "salon_spa") {
        return "What time would you prefer?";
      }

      return "What time works best for you?";
    }

    if (!session.slots.participants) {
      if (session.business_type === "hospital_clinic") {
        return "Should I note this for just one person?";
      }

      if (session.business_type === "office_business") {
        return "How many people should I include in the meeting?";
      }

      return "How many people should I include?";
    }

    if (!session.slots.name) {
      if (session.business_type === "hospital_clinic") {
        return "Got it. What name should I note for the appointment?";
      }

      if (session.business_type === "office_business") {
        return "Got it. What name should I note for this meeting request?";
      }

      return "Got it. What name should I note for this request?";
    }

    return `Thanks, ${session.slots.name} — I’ve noted your request for ${session.slots.service_type} on ${session.slots.date} at ${session.slots.time} for ${session.slots.participants} people.`;
  }

  return null;
}

function hasActiveStructuredGptChatFlow(session) {
  return !!(session && session.scenario);
}

function normalizeGptChatReply(finalReply, session, channel = "chat") {
  let reply = String(finalReply || "").trim().replace(/\s+/g, " ");

  if (
    session?.scenario === "restaurant_reservation" ||
    session?.scenario === "generic_service" ||
    session?.scenario === "hotel_booking"
  ) {
    reply = reply
      .replace(/\byou(?:'re| are) all set\b/gi, "I’ve noted the request")
      .replace(/\bconfirmed\b/gi, "noted")
      .replace(/\bbooked\b/gi, "noted")
      .replace(/\byour table is set\b/gi, "your request is noted")
      .replace(/\byour booking is set\b/gi, "your request is noted")
      .replace(/\breservation confirmed\b/gi, "reservation request noted");
  }

  if (channel === "voice" && reply.length > 220) {
    reply = reply.slice(0, 220).trim();
    if (!/[.!?]$/.test(reply)) {
      reply += ".";
    }
  }

  return reply;
}

async function handleConversationTurn({
  sessionId,
  message,
  channel = "chat",
  tenantBusinessType = null,
  tenantId = 1,
  locale = "en-US",
}) {
  const cleanMessage = typeof message === "string" ? message.trim() : "";
  if (!cleanMessage) {
    return {
      ok: false,
      error: "Message is required",
    };
  }

  if (cleanMessage.length > 2000) {
    return {
      ok: false,
      error: "Message is too long",
    };
  }

  const incomingSessionId = safeGptChatSessionId(sessionId);
  const resolvedSessionId = incomingSessionId || `gpt_demo_${Date.now()}`;
  const session = getOrCreateGptChatSession(resolvedSessionId);

  const requestedTenantBusinessType = normalizeBusinessType(tenantBusinessType);
  const defaultTenantBusinessType = normalizeBusinessType(
    process.env.DEFAULT_TENANT_BUSINESS_TYPE
  );

  if (session) {
    if (!session.tenant_business_type && requestedTenantBusinessType) {
      session.tenant_business_type = requestedTenantBusinessType;
    }

    if (!session.tenant_business_type && defaultTenantBusinessType) {
      session.tenant_business_type = defaultTenantBusinessType;
    }

    pushGptChatHistory(session, "user", cleanMessage);

    const detected = detectGptChatScenarioFromText(cleanMessage);
    const detectedBusinessType = detectBusinessTypeFromText(cleanMessage);

    if (!session.scenario && detected.scenario) {
      session.scenario = detected.scenario;
    }

    if (detected.intent) {
      session.last_intent = detected.intent;
    }

    const resolvedBusinessType =
      session.tenant_business_type ||
      session.business_type ||
      detectedBusinessType ||
      "generic";

    if (!session.business_type && resolvedBusinessType) {
      session.business_type = resolvedBusinessType;
    }

    const extracted = extractGptChatSlotsFromText(
      cleanMessage,
      session.scenario || detected.scenario
    );

    for (const [key, value] of Object.entries(extracted)) {
      setGptChatSlot(session, key, value);
    }
  }

  let finalReply = "";
  let resultSource = "brain";
  let result = null;

  const structuredFlowActive = hasActiveStructuredGptChatFlow(session);
  const deterministicReply = structuredFlowActive
    ? buildGptChatFollowUp(session, channel)
    : null;

  if (deterministicReply) {
    finalReply = deterministicReply;
    resultSource = "brain";
  } else {
    try {
      result = await retrieveAnswer(cleanMessage, tenantId, locale);
    } catch (innerErr) {
      console.error("❌ handleConversationTurn retrieveAnswer failed:", innerErr);
      result = null;
    }

    finalReply =
      typeof result === "string"
        ? result
        : result?.reply ||
          result?.answer ||
          result?.text ||
          result?.message ||
          "";

    resultSource =
      typeof result === "object" && result?.source ? result.source : "brain";

    const looksLikeErrorReply =
      !finalReply ||
      resultSource === "error" ||
      /temporary issue|try again|knowledge base|something went wrong/i.test(finalReply);

    if (looksLikeErrorReply) {
      const lower = cleanMessage.toLowerCase();

      if (
        lower.includes("table") ||
        lower.includes("reservation") ||
        lower.includes("restaurant") ||
        lower.includes("menu")
      ) {
        finalReply =
          channel === "voice"
            ? "Sure — what day works for the reservation?"
            : "Sure — what day would you like the reservation?";
      } else if (
        lower.includes("room") ||
        lower.includes("hotel") ||
        lower.includes("stay") ||
        lower.includes("check-in")
      ) {
        finalReply = "Of course. When would you like to check in?";
      } else if (
        lower.includes("issue") ||
        lower.includes("problem") ||
        lower.includes("help") ||
        lower.includes("support")
      ) {
        finalReply = "I can help with that. What seems to be the main issue?";
      } else {
        finalReply =
          "We handle customer inquiries, booking requests, service questions, and general support. What would you like help with today?";
      }

      resultSource = "brain";
    }
  }

  finalReply = normalizeGptChatReply(finalReply, session, channel);

  if (!finalReply) {
    finalReply = "Could you tell me a little more about what you need?";
    resultSource = "brain";
  }

  if (session) {
    pushGptChatHistory(session, "assistant", finalReply);
  }

  return {
    ok: true,
    reply: finalReply,
    session_id: resolvedSessionId,
    source: resultSource,
    scenario: session?.scenario || null,
    tenant_business_type: session?.tenant_business_type || null,
    business_type: session?.business_type || null,
    context: session ? buildGptChatContextSummary(session) : "",
    session,
  };
}
// ---------------------------------------------------------------------------

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
  console.warn(
    "⚠️ Story 12.8 securityHeaders not loaded:",
    e && e.message ? e.message : String(e)
  );
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
    const allow = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

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
if (compression) {
  app.use(
    compression({
      filter: (req, res) => {
        try {
          const p = req.originalUrl || req.url || "";
          const accept = String(req.headers?.accept || "");

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
    const result = await handleConversationTurn({
      sessionId: req.body?.session_id,
      message: req.body?.message,
      channel: "chat",
      tenantBusinessType: req.body?.tenant_business_type || null,
      tenantId: 1,
      locale: "en-US",
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.status(200).json({
      ok: true,
      reply: result.reply,
      session_id: result.session_id,
      source: result.source,
      scenario: result.scenario,
      tenant_business_type: result.tenant_business_type,
      business_type: result.business_type,
      context: result.context,
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

const { router: twilioRouter, handleTwilioStream } = require("./src/routes/twilio");
app.use("/twilio", twilioRouter);
console.log("✅ Mounted /twilio routes");



if (typeof app.ws === "function") {
  app.ws("/ws/twilio-stream", (ws, req) => {
    console.log("🔥 [twilio_stream_inline] connected");

    try {
      // Call your existing handler directly
      handleTwilioStream(ws, req);
    } catch (err) {
      console.error("❌ [twilio_stream_inline] handler crash:", err.message);
      try {
        ws.close();
      } catch (_) {}
    }
  });

  console.log("✅ Mounted WebSocket streaming route at /ws/twilio-stream (Story 13.1.7 INLINE)");
}

  else {
  console.warn("⚠️ app.ws is not available; /ws/twilio-stream WebSocket route not mounted.");
}

if (typeof app.ws === "function") {
  app.ws("/ws/probe", (ws, req) => {
    console.log("🧪 [ws_probe] connected");

    ws.on("message", (msg) => {
      const text = String(msg || "");
      console.log("🧪 [ws_probe] message:", text);

      try {
        ws.send(JSON.stringify({ ok: true, echo: text }));
      } catch (err) {
        console.error("❌ [ws_probe] send failed:", err.message);
      }
    });

    ws.on("close", () => {
      console.log("🧪 [ws_probe] closed");
    });
  });

  console.log("✅ Mounted WebSocket probe route at /ws/probe (Story 13.1.5)");
}

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
// ---------------------------------------------------------------------------
const wellKnownAbsolute = path.resolve(__dirname, "public", "wellknown");

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

// 🔒 Regex catch-all for any .well-known/*
app.get(/^\/\.well-known\/(.+)$/i, (req, res) => {
  const requested = (req.params[0] || "").toString();
  const safeName = requested.replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(wellKnownAbsolute, safeName);
  console.log("➡️  [.well-known regex] request:", requested, "→", filePath);

  if (!fs.existsSync(filePath)) {
    console.error("❌ [.well-known regex] not found:", filePath);
    return res.status(404).send("Not Found");
  }

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
  res
    .status(200)
    .send("Welcome to Alphine AI. The call orchestration service is active.");
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

    const stack =
      app && app._router && Array.isArray(app._router.stack) ? app._router.stack : null;
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

    console.log(
      "➡️ Final decision: langCode =",
      langCode,
      "| sessionLang =",
      sessionLang
    );

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

module.exports = {
  onSTTResponse,
  onStreamEnd,
  handleConversationTurn,
};