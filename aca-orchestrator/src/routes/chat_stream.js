// src/routes/chat_stream.js
// Story 12.5 — SSE-style streaming chat endpoint with session memory + guardrails
// FIX: Immediately emit a first SSE frame to prevent early client abort.
// FIX: Send SSE `event:` and `data:` with no extra trimming logic.

const express = require("express");
const jwt = require("jsonwebtoken");

// Reuse existing ACA brain
const { retrieveAnswer } = require("../../retriever");

// Memory
const { pushTurn, buildMemoryPrefix, clearSession } = require("../brain/utils/sessionMemory");

const router = express.Router();

// -----------------------------
// Guardrail constants
// -----------------------------
const MAX_INCOMING_CHARS = 2000;
const MAX_STREAMS_PER_TENANT = 6;
const STREAM_WINDOW_MS = 10_000;
const HEARTBEAT_MS = 10_000; // a bit more frequent for Render/proxies

// tenant_id -> { count, resetAt }
const streamLimiter = new Map();

function limiterAllow(tenant_id) {
  const tid = String(tenant_id || "anon");
  const now = Date.now();
  const entry = streamLimiter.get(tid) || { count: 0, resetAt: now + STREAM_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + STREAM_WINDOW_MS;
  }
  entry.count += 1;
  streamLimiter.set(tid, entry);

  return entry.count <= MAX_STREAMS_PER_TENANT;
}

// ---------------------------------------------------------------------------
// Middleware: verify JWT (tenant-safe)
// ---------------------------------------------------------------------------
function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.tenant_id = decoded.tenant_id;
    req.partner_id = decoded.partner_id;
    req.role = decoded.role;

    if (!req.tenant_id) {
      return res.status(401).json({ ok: false, error: "Unauthorized (no tenant_id)" });
    }
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

// ---------------------------------------------------------------------------
// Helper: SSE write
// IMPORTANT: Use `event: <name>` and `data: <payload>` (space after colon is fine),
// but NEVER trim payload; replace newlines so frames stay single-line.
// ---------------------------------------------------------------------------
function sseWrite(res, eventName, data) {
  if (res.writableEnded) return;
  const safe = String(data ?? "").replace(/\r?\n/g, "\\n");
  res.write(`event: ${String(eventName)}\n`);
  res.write(`data: ${safe}\n\n`);
}

// Chunking: simulate token streaming from a final text
function* chunkText(text, chunkSize = 18) {
  const t = String(text || "");
  for (let i = 0; i < t.length; i += chunkSize) {
    yield t.slice(i, i + chunkSize);
  }
}

// ---------------------------------------------------------------------------
// POST /api/chat/session/clear
// ---------------------------------------------------------------------------
router.post("/chat/session/clear", authenticate, (req, res) => {
  try {
    const tenant_id = req.tenant_id;
    const session_id = (req.body && req.body.session_id) ? String(req.body.session_id) : "web";

    clearSession(tenant_id, session_id);
    console.log(`[chat_stream] session cleared tenant=${tenant_id} session=${session_id}`);

    return res.json({ ok: true, cleared: true, tenant_id, session_id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Failed to clear session" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/chat/stream
// ---------------------------------------------------------------------------
router.post("/chat/stream", authenticate, async (req, res) => {
  const tenant_id = req.tenant_id;

  if (!limiterAllow(tenant_id)) {
    return res.status(429).json({ ok: false, error: "Too many streaming requests (rate limited)" });
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // flush headers early
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const reqId = `sse_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let clientClosed = false;

  req.on("close", () => {
    clientClosed = true;
  });

  // ✅ CRITICAL: send first bytes immediately (prevents early browser abort)
  // Also useful for debugging: DevTools should show this instantly.
  try {
    sseWrite(res, "connected", "ok");
  } catch (e) {}

  // Heartbeat to keep proxies happy
  const heartbeat = setInterval(() => {
    if (clientClosed || res.writableEnded) return;
    try {
      res.write(": ping\n\n");
    } catch (e) {}
  }, HEARTBEAT_MS);

  try {
    const messageRaw = (req.body && req.body.message) ? String(req.body.message) : "";
    const session_id = (req.body && req.body.session_id) ? String(req.body.session_id) : "web";
    const locale = (req.body && req.body.locale) ? String(req.body.locale) : "en-US";

    console.log(`[chat_stream] start ${reqId} tenant=${tenant_id} session=${session_id} locale=${locale}`);

    const message = messageRaw.trim();
    if (!message) {
      sseWrite(res, "error", "Empty message");
      sseWrite(res, "done", "");
      clearInterval(heartbeat);
      return res.end();
    }

    if (message.length > MAX_INCOMING_CHARS) {
      sseWrite(res, "error", `Message too long (max ${MAX_INCOMING_CHARS} chars)`);
      sseWrite(res, "done", "");
      clearInterval(heartbeat);
      return res.end();
    }

    // Store user turn
    pushTurn(tenant_id, session_id, "user", message);

    // Let UI know we started processing (optional)
    sseWrite(res, "start", "");

    // Memory prefix (no brain signature changes)
    const prefix = buildMemoryPrefix(tenant_id, session_id);
    const brainInput = prefix + message;

    // Call ACA brain
    const result = await retrieveAnswer(brainInput, tenant_id, session_id, locale);

    if (clientClosed || res.writableEnded) {
      console.log(`[chat_stream] client closed early ${reqId} tenant=${tenant_id} session=${session_id}`);
      clearInterval(heartbeat);
      return res.end();
    }

    const reply =
      (typeof result === "string") ? result :
      (result && typeof result.reply === "string") ? result.reply :
      (result && typeof result.answer === "string") ? result.answer :
      (result && result.data && typeof result.data.reply === "string") ? result.data.reply :
      JSON.stringify(result);

    for (const chunk of chunkText(reply, 18)) {
      if (clientClosed || res.writableEnded) break;
      sseWrite(res, "token", chunk);
      await new Promise(r => setTimeout(r, 20));
    }

    if (!clientClosed && !res.writableEnded) {
      sseWrite(res, "done", "");
    }

    // Store assistant turn
    pushTurn(tenant_id, session_id, "assistant", reply);

    console.log(`[chat_stream] done ${reqId} tenant=${tenant_id} session=${session_id}`);

    clearInterval(heartbeat);
    return res.end();
  } catch (err) {
    console.log(`[chat_stream] error ${reqId} tenant=${tenant_id} msg=${err?.message || "unknown"}`);

    try {
      sseWrite(res, "error", err?.message || "Server error");
      sseWrite(res, "done", "");
    } catch (e) {}

    clearInterval(heartbeat);
    return res.end();
  }
});

module.exports = router;
