"use strict";

const { redactText } = require("./redactor");

// -----------------------------
// Defaults (secure + bounded)
// -----------------------------
const DEFAULT_TTL_MS = 60 * 60 * 1000;        // 60 min inactivity
const DEFAULT_MAX_TURNS = 10;                 // keep last 10 turns
const DEFAULT_MAX_TEXT_CHARS = 1800;          // cap each message length stored
const DEFAULT_MAX_SUMMARY_CHARS = 2500;       // cap summary length

// tenant_id::session_id -> state
const store = new Map();

function makeKey(tenant_id, session_id) {
  return `${tenant_id}::${session_id}`;
}

function nowMs() {
  return Date.now();
}

function clampText(s, maxChars) {
  if (!s) return "";
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + "";
}

function getOrCreate(tenant_id, session_id, opts = {}) {
  const key = makeKey(tenant_id, session_id);
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;

  const existing = store.get(key);
  if (existing) {
    // TTL check
    if (existing.lastSeenAt && nowMs() - existing.lastSeenAt > ttlMs) {
      store.delete(key);
    } else {
      return existing;
    }
  }

  const state = {
    tenant_id,
    session_id,
    createdAt: nowMs(),
    lastSeenAt: nowMs(),
    turns: [],                 // [{role:'user'|'assistant', text, ts, intentTag?}]
    summary: "",               // compressed earlier context
    activeIntent: "",          // current inferred intent/topic
  };

  store.set(key, state);
  return state;
}

function touch(tenant_id, session_id, opts = {}) {
  const s = getOrCreate(tenant_id, session_id, opts);
  s.lastSeenAt = nowMs();
  return s;
}

function appendTurn(tenant_id, session_id, role, text, meta = {}, opts = {}) {
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  const maxChars = opts.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS;

  const state = getOrCreate(tenant_id, session_id, opts);
  state.lastSeenAt = nowMs();

  const safe = clampText(redactText(String(text || "")), maxChars);

  state.turns.push({
    role,
    text: safe,
    ts: nowMs(),
    intentTag: meta.intentTag || "",
  });

  // Hard cap turns (we will summarize elsewhere before trimming ideally)
  if (state.turns.length > maxTurns + 6) {
    state.turns = state.turns.slice(-1 * (maxTurns + 6));
  }

  return state;
}

function setSummary(tenant_id, session_id, summary, opts = {}) {
  const maxSummaryChars = opts.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS;
  const state = getOrCreate(tenant_id, session_id, opts);
  state.lastSeenAt = nowMs();
  state.summary = clampText(redactText(String(summary || "")), maxSummaryChars);
  return state;
}

function setActiveIntent(tenant_id, session_id, activeIntent, opts = {}) {
  const state = getOrCreate(tenant_id, session_id, opts);
  state.lastSeenAt = nowMs();
  state.activeIntent = clampText(redactText(String(activeIntent || "")), 300);
  return state;
}

function getState(tenant_id, session_id, opts = {}) {
  return getOrCreate(tenant_id, session_id, opts);
}

function pruneExpired(opts = {}) {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const t = nowMs();

  for (const [key, state] of store.entries()) {
    if (!state.lastSeenAt) continue;
    if (t - state.lastSeenAt > ttlMs) store.delete(key);
  }
}

function resetSession(tenant_id, session_id) {
  store.delete(makeKey(tenant_id, session_id));
}

module.exports = {
  getState,
  touch,
  appendTurn,
  setSummary,
  setActiveIntent,
  pruneExpired,
  resetSession,

  // exported for debug only (dont expose without auth)
  _store: store,
};
