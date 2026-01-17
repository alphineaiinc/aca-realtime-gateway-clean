// retriever.js
// ACA Orchestrator — Story 12.6/12.7 behavior preserved:
// - session memory (in-memory, tenant+session scoped, TTL + max turns)
// - small-talk fast path
// - timeout guard wrapper
// Plus: c24b3cad change:
// - OpenAI client embeddings (text-embedding-3-small)

const path = require("path");

// ✅ Always load orchestrator-local .env first (prevents root .env overriding)
require("dotenv").config({
  path: path.resolve(__dirname, "./.env"),
  override: true,
});

const { Pool } = require("pg");
const OpenAI = require("openai");

// ------------------------------------------------------------------
// 🧠 Optional Resilience Imports (do NOT hard-fail if files absent)
// ------------------------------------------------------------------
let requestWithRetry = null;
let observeHttpRetry = null;

try {
  // Some branches/commits may not have these files; keep retriever loadable.
  // If present, they can be used elsewhere in the codebase.
  ({ requestWithRetry } = require("./src/brain/utils/safeAxios"));
} catch (_) {
  requestWithRetry = null;
}

try {
  ({ observeHttpRetry } = require("./src/monitor/resilienceMetrics"));
} catch (_) {
  observeHttpRetry = null;
}

// ------------------------------------------------------------------
// 🔐 Environment Validation
// ------------------------------------------------------------------
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY not loaded. Check .env in aca-orchestrator.");
  process.exit(1);
}

// ------------------------------------------------------------------
// 🗄️ Database + OpenAI Clients
// ------------------------------------------------------------------
const kbConn =
  process.env.KB_DB_URL ||
  process.env.KB_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!kbConn) {
  console.error(
    "❌ KB database URL not configured. Set KB_DB_URL or KB_DATABASE_URL or DATABASE_URL."
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: kbConn,
  ssl:
    kbConn.includes("sslmode=require") || process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: false }
      : undefined,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ------------------------------------------------------------------
// 🧠 Story 12.6/12.7 — Session Memory (in-memory, TTL guarded)
// ------------------------------------------------------------------
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 10 * 60 * 1000); // 10 min default
const SESSION_MAX_TURNS = Number(process.env.SESSION_MAX_TURNS || 12); // user+assistant pairs-ish
const sessionStore = new Map(); // key => { history: [{role, content}], updatedAt }

// Keyed by tenant+session to keep isolation tight
function sessionKey(tenant_id, session_id) {
  return `${String(tenant_id || 0)}::${String(session_id || "anon")}`;
}

function nowMs() {
  return Date.now();
}

function trimHistory(history) {
  if (!Array.isArray(history)) return [];
  // Keep only the most recent SESSION_MAX_TURNS * 2 messages (user+assistant)
  const maxMsgs = Math.max(2, SESSION_MAX_TURNS * 2);
  if (history.length <= maxMsgs) return history;
  return history.slice(history.length - maxMsgs);
}

function getSessionHistory(tenant_id, session_id) {
  const key = sessionKey(tenant_id, session_id);
  const item = sessionStore.get(key);
  if (!item) return [];

  // TTL eviction
  if (nowMs() - item.updatedAt > SESSION_TTL_MS) {
    sessionStore.delete(key);
    return [];
  }
  return Array.isArray(item.history) ? item.history : [];
}

function upsertSessionHistory(tenant_id, session_id, history) {
  const key = sessionKey(tenant_id, session_id);
  sessionStore.set(key, {
    history: trimHistory(history),
    updatedAt: nowMs(),
  });
}

function appendToSession(tenant_id, session_id, role, content) {
  if (!content || typeof content !== "string") return;
  const prev = getSessionHistory(tenant_id, session_id);
  const next = prev.concat([{ role, content }]);
  upsertSessionHistory(tenant_id, session_id, next);
}

// Optional helper for diagnostics
function getSessionStats() {
  return {
    sessions: sessionStore.size,
    ttl_ms: SESSION_TTL_MS,
    max_turns: SESSION_MAX_TURNS,
  };
}

// ------------------------------------------------------------------
// 💬 Story 12.7 — Small-talk Fast Path
// ------------------------------------------------------------------
function isSmallTalk(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim().toLowerCase();

  const smallTalkPhrases = [
    "hi",
    "hello",
    "hey",
    "good morning",
    "good afternoon",
    "good evening",
    "how are you",
    "how r u",
    "what's up",
    "whats up",
    "thanks",
    "thank you",
    "thx",
    "bye",
    "goodbye",
  ];

  if (smallTalkPhrases.includes(t)) return true;
  return smallTalkPhrases.some((p) => t.startsWith(p + " "));
}

function smallTalkReply(text) {
  const t = (text || "").trim().toLowerCase();

  if (t.startsWith("bye") || t.includes("goodbye")) {
    return "Bye! If you need anything else, just message me.";
  }
  if (t.includes("thank")) {
    return "You’re welcome — happy to help. What would you like to do next?";
  }
  if (t.includes("how are you") || t.includes("how r u")) {
    return "Doing great. Tell me what you need and I’ll handle it.";
  }
  return "Hi! How can I help you today?";
}

// ------------------------------------------------------------------
// ⏱️ Story 12.6 — Timeout Guard Wrapper
// ------------------------------------------------------------------
async function withTimeout(promise, timeoutMs, label = "operation") {
  const ms = Number(timeoutMs || process.env.RETRIEVER_TIMEOUT_MS || 12_000);
  let to;
  const timeout = new Promise((_, reject) => {
    to = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(to);
  }
}

// ------------------------------------------------------------------
// 🔎 Embedding + KB Search (OpenAI client embeddings)
// ------------------------------------------------------------------
async function embedText(text) {
  const input = typeof text === "string" ? text : String(text || "");
  const res = await withTimeout(
    openai.embeddings.create({
      model: "text-embedding-3-small",
      input,
    }),
    process.env.EMBEDDING_TIMEOUT_MS || 12_000,
    "embeddings.create"
  );

  const v = res && res.data && res.data[0] && res.data[0].embedding;
  if (!Array.isArray(v) || v.length < 10) {
    throw new Error("Invalid embedding returned from OpenAI");
  }
  return v;
}

async function searchKB({ tenant_id = 1, query, topK = 5 }) {
  const q = (query || "").trim();
  if (!q) return [];

  try {
    console.log("🔍 searchKB embedding input preview:", {
      originalType: typeof query,
      normalizedLength: q.length,
    });
  } catch (_) {}

  const embedding = await embedText(q);

  const sql = `
    SELECT
      id,
      content,
      source,
      title,
      metadata
    FROM knowledge_base
    WHERE tenant_id = $1
    ORDER BY embedding <-> $2::vector
    LIMIT $3
  `;

  const params = [tenant_id, embedding, Math.max(1, Number(topK || 5))];

  const rows = await withTimeout(
    pool.query(sql, params).then((r) => r.rows || []),
    process.env.KB_TIMEOUT_MS || 12_000,
    "KB search"
  );

  return rows;
}

// ------------------------------------------------------------------
// 🧠 Main entry used by index.js — retrieveAnswer
// ------------------------------------------------------------------
async function retrieveAnswer(
  text,
  tenant_id = 1,
  locale = "en-US",
  session_id = "anon",
  opts = {}
) {
  const t = (text || "").trim();

  // 1) small-talk fast path
  if (isSmallTalk(t)) {
    const reply = smallTalkReply(t);

    appendToSession(tenant_id, session_id, "user", t);
    appendToSession(tenant_id, session_id, "assistant", reply);

    return {
      ok: true,
      reply,
      confidence: 0.96,
      source: "smalltalk",
      session_id,
      locale,
    };
  }

  // 2) session memory context (currently not injected into KB query; preserved for upstream)
  const history = getSessionHistory(tenant_id, session_id);

  // 3) KB retrieval with strict timeout guards
  let kbResults = [];
  try {
    kbResults = await searchKB({
      tenant_id,
      query: t,
      topK: opts.topK || 5,
    });
  } catch (err) {
    console.error("❌ searchKB error (DB or embeddings):", err);

    try {
      if (typeof observeHttpRetry === "function") {
        observeHttpRetry({
          scope: "retriever.searchKB",
          ok: false,
          reason: String(err && err.message ? err.message : err),
        });
      }
    } catch (_) {}

    appendToSession(tenant_id, session_id, "user", t);

    return {
      ok: false,
      reply:
        "Sorry — I hit a temporary issue while searching our knowledge base. Please try again in a moment.",
      confidence: 0.15,
      source: "error",
      session_id,
      locale,
    };
  }

  // 4) Deterministic answer from KB results
  let reply = "";
  let confidence = 0.55;
  let source = "kb";

  if (!kbResults || kbResults.length === 0) {
    reply =
      "I don’t have enough information in the knowledge base for that yet. Can you share a bit more detail?";
    confidence = 0.35;
    source = "kb_empty";
  } else {
    const top = kbResults[0];
    const content = (top && top.content ? String(top.content) : "").trim();

    reply =
      content ||
      "I found related information, but it looks empty. Please re-ingest that KB entry.";
    confidence = 0.72;
    source = top && top.source ? String(top.source) : "kb";
  }

  // 5) Update session memory
  appendToSession(tenant_id, session_id, "user", t);
  appendToSession(
    tenant_id,
    session_id,
    "assistant",
    reply.length > 800 ? reply.slice(0, 800) + "…" : reply
  );

  return {
    ok: true,
    reply,
    confidence,
    source,
    session_id,
    locale,
    ...(opts.include_debug
      ? {
          debug: {
            kb_hits: kbResults.length,
            session: getSessionStats(),
            history_len: history.length,
          },
        }
      : {}),
  };
}

module.exports = {
  retrieveAnswer,
  searchKB,
  embedText,
  getSessionHistory,
  upsertSessionHistory,
  appendToSession,
};
