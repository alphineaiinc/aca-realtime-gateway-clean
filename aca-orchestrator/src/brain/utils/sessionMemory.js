// src/brain/utils/sessionMemory.js
// Story 12.5 — Tenant-safe bounded in-memory session memory (short-term)
// Security defaults: tenant_id included in key, bounded size, TTL cleanup, no disk writes

const TTL_MS = 30 * 60 * 1000;     // 30 minutes
const MAX_TURNS = 12;              // total messages stored (user+assistant combined)
const MAX_CHARS = 800;             // per message cap to limit memory bloat

// tenant_id::session_id -> { turns: [{role, text, ts}], updatedAt }
const bucket = new Map();

function keyOf(tenant_id, session_id) {
  return `${String(tenant_id)}::${String(session_id || "default")}`;
}

function now() {
  return Date.now();
}

function trimText(s) {
  if (!s) return "";
  const t = String(s);
  return t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) + "…" : t;
}

function cleanupExpired() {
  const t = now();
  for (const [k, v] of bucket.entries()) {
    if (!v || !v.updatedAt || (t - v.updatedAt) > TTL_MS) {
      bucket.delete(k);
    }
  }
}

// Call occasionally (safe + cheap)
function touchCleanup() {
  // probabilistic cleanup: ~1 in 25 calls
  if ((Math.random() * 25) < 1) cleanupExpired();
}

function pushTurn(tenant_id, session_id, role, text) {
  touchCleanup();

  const k = keyOf(tenant_id, session_id);
  const entry = bucket.get(k) || { turns: [], updatedAt: now() };

  entry.turns.push({
    role: role === "assistant" ? "assistant" : "user",
    text: trimText(text),
    ts: now()
  });

  // bound turns
  if (entry.turns.length > MAX_TURNS) {
    entry.turns = entry.turns.slice(entry.turns.length - MAX_TURNS);
  }

  entry.updatedAt = now();
  bucket.set(k, entry);
}

function getTurns(tenant_id, session_id) {
  touchCleanup();
  const k = keyOf(tenant_id, session_id);
  const entry = bucket.get(k);
  if (!entry) return [];
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
