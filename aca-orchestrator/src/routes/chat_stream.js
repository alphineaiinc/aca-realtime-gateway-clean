// src/routes/chat_stream.js
// Story 12.5 — SSE-style streaming chat endpoint with session memory

const express = require("express");
const jwt = require("jsonwebtoken");

// Reuse existing ACA brain
const { retrieveAnswer } = require("../../retriever");

// Memory
const { pushTurn, buildMemoryPrefix } = require("../brain/utils/sessionMemory");

const router = express.Router();

// ---------------------------------------------------------------------------
// Middleware: verify JWT (tenant-safe)
// ---------------------------------------------------------------------------
function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // expected fields: tenant_id (required), partner_id/role optional
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
// ---------------------------------------------------------------------------
function sseWrite(res, eventName, data) {
  // SSE format:
  // event: <name>\n
  // data: <payload>\n\n
  res.write(`event: ${eventName}\n`);
  // Ensure data is single-line safe
  const safe = String(data ?? "").replace(/\r?\n/g, "\\n");
  res.write(`data: ${safe}\n\n`);
}

// Chunking: simulate token streaming from a final text
function* chunkText(text, chunkSize = 18) {
  const t = String(text || "");
  for (let i = 0; i < t.length; i += chunkSize) {
    yield t.slice(i, i + chunkSize);
  }
}

router.post("/chat/stream", authenticate, async (req, res) => {
  // SSE headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // If behind proxies, flush headers early
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  // Heartbeat to keep Render/proxies happy
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch (e) {}
  }, 15000);

  try {
    const tenant_id = req.tenant_id;

    const message = (req.body && req.body.message) ? String(req.body.message) : "";
    const session_id = (req.body && req.body.session_id) ? String(req.body.session_id) : "web";
    const locale = (req.body && req.body.locale) ? String(req.body.locale) : "en-US";

    if (!message.trim()) {
      sseWrite(res, "error", "Empty message");
      sseWrite(res, "done", "");
      clearInterval(heartbeat);
      return res.end();
    }

    // Store user turn immediately
    pushTurn(tenant_id, session_id, "user", message);

    // Prepend memory (does not change brain signature)
    const prefix = buildMemoryPrefix(tenant_id, session_id);
    const brainInput = prefix + message;

    // Call your existing brain
    const result = await retrieveAnswer(brainInput, tenant_id, session_id, locale);

    // Support common shapes: string OR { reply } OR { answer }
    const reply =
      (typeof result === "string") ? result :
      (result && typeof result.reply === "string") ? result.reply :
      (result && typeof result.answer === "string") ? result.answer :
      (result && result.data && typeof result.data.reply === "string") ? result.data.reply :
      JSON.stringify(result);

    // Stream it out in chunks
    sseWrite(res, "start", "");

    for (const chunk of chunkText(reply, 18)) {
      sseWrite(res, "token", chunk);
      // typing cadence (small delay)
      await new Promise(r => setTimeout(r, 20));
    }

    sseWrite(res, "done", "");

    // Store assistant turn at end
    pushTurn(tenant_id, session_id, "assistant", reply);

    clearInterval(heartbeat);
    return res.end();
  } catch (err) {
    try {
      sseWrite(res, "error", err?.message || "Server error");
      sseWrite(res, "done", "");
    } catch (e) {}
    clearInterval(heartbeat);
    return res.end();
  }
});

module.exports = router;
