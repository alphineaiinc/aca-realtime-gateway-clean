// src/brain/utils/sessionMemory.js
// Story 12.5 — Tenant-safe bounded in-memory session memory (short-term)
// Story 12.6 — TTL-based session memory eviction + safe audit (no raw content logs)
// Security defaults: tenant_id included in key, bounded size, TTL cleanup, no disk writes

// ------------------------------
// Defaults (override via env)
// ------------------------------
const TTL_MS = parseInt(process.env.SESSION_MEMORY_TTL_MS || String(30 * 60 * 1000), 10);   // 30 minutes
const MAX_TURNS = parseInt(process.env.SESSION_MEMORY_MAX_TURNS || "12", 10);              // user+assistant combined
const MAX_CHARS = parseInt(process.env.SESSION_MEMORY_MAX_CHARS || "800", 10);             // per message cap

// Cleanup behavior (cheap + safe)
const CLEANUP_EVERY_MS = parseInt(process.env.SESSION_MEMORY_CLEANUP_EVERY_MS || "60000", 10); // 60s min interval
const CLEANUP_PROB_DIV = parseInt(process.env.SESSION_MEMORY_CLEANUP_PROB_DIV || "25", 10);    // ~1 in 25 calls

// tenant_id::session_id -> { turns: [{role, text, ts}], updatedAt, createdAt }
const bucket = new Map();

let lastCleanupAt = 0;

function keyOf(tenant_id, session_id) {
  return `${String(tenant_id)}::${String(session_id || "default")}`;
}

function now() {
  return Date.now();
}

function trimText(s) {
  if (!s) return "";
  const t = String(s);

  // Normalize basic whitespace to reduce memory bloat without changing meaning
  const normalized = t.replace(/\s+/g, " ").trim();

  return normalized.length > MAX_CHARS ? normalized.slice(0, MAX_CHARS) + "…" : normalized;
}

// Removes expired sessions and returns count removed (no raw content logs)
function cleanupExpired() {
  const t = now();
  let removed = 0;

  for (const [k, v] of bucket.entries()) {
    if (!v || !v.updatedAt || (t - v.updatedAt) > TTL_MS) {
      bucket.delete(k);
      removed += 1;
    }
  }

  return removed;
}

// Call occasionally (safe + cheap)
function touchCleanup() {
  const t = now();

  // time gate to avoid cleanup storms
  if ((t - lastCleanupAt) < CLEANUP_EVERY_MS) return;

  // probabilistic cleanup: ~1 in CLEANUP_PROB_DIV calls
  if ((Math.random() * CLEANUP_PROB_DIV) < 1) {
    const removed = cleanupExpired();
    lastCleanupAt = t;

    // ✅ Safe audit log: only counts, never content
    if (removed > 0) {
      console.log(`[sessionMemory] cleanup removed=${removed} ttl_ms=${TTL_MS}`);
    }
  }
}

function pushTurn(tenant_id, session_id, role, text) {
  touchCleanup();

  const k = keyOf(tenant_id, session_id);
  const t = now();

  const entry = bucket.get(k) || { turns: [], updatedAt: t, createdAt: t };

  entry.turns.push({
    role: role === "assistant" ? "assistant" : "user",
    text: trimText(text),
    ts: t
  });

  // bound turns (keep most recent)
  if (entry.turns.length > MAX_TURNS) {
    entry.turns = entry.turns.slice(entry.turns.length - MAX_TURNS);
  }

  entry.updatedAt = t;
  bucket.set(k, entry);
}

function getTurns(tenant_id, session_id) {
  touchCleanup();

  const k = keyOf(tenant_id, session_id);
  const entry = bucket.get(k);
  if (!entry) return [];

  // If expired, evict immediately on read
  const t = now();
  if (!entry.updatedAt || (t - entry.updatedAt) > TTL_MS) {
    bucket.delete(k);
    return [];
  }

  return entry.turns || [];
}

function clearSession(tenant_id, session_id) {
  const k = keyOf(tenant_id, session_id);
  bucket.delete(k);
}

// Converts memory into a safe prefix that we prepend to the user message.
// This avoids changing retrieveAnswer() signature and reuses ACA brain as-is.
function buildMemoryPrefix(tenant_id, session_id) {
  const turns = getTurns(tenant_id, session_id);
  if (!turns.length) return "";

  // Keep it compact and deterministic
  const lines = turns.map(t => {
    const who = t.role === "assistant" ? "Assistant" : "User";
    return `${who}: ${t.text}`;
  });

  return (
    "Conversation so far (most recent context):\n" +
    lines.join("\n") +
    "\n\n"
  );
}

module.exports = {
  pushTurn,
  getTurns,
  clearSession,
  cleanupExpired,
  buildMemoryPrefix
};
