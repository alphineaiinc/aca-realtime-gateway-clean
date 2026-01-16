// src/routes/chat.js
const express = require("express");
const jwt = require("jsonwebtoken");

const { retrieveAnswer } = require("../../retriever"); // <-- If this path fails, see validation section below.

// ✅ Story 12.7 — New session memory + intent carryover + memory-aware context
let memory = null;
let resolveActiveIntent = null;
let buildContext = null;
try {
  memory = require("../brain/memory/sessionMemory");
  ({ resolveActiveIntent } = require("../brain/memory/intentCarryover"));
  ({ buildContext } = require("../brain/memory/contextBuilder"));
  console.log("✅ [chat] Story 12.7 memory modules loaded");
} catch (err) {
  console.warn("⚠️ [chat] Story 12.7 memory modules not loaded:", err.message);
}

const router = express.Router();

// -------------------------------
// Security: small input limits
// -------------------------------
const MAX_MSG_CHARS = 2000;

// -------------------------------
// Simple in-memory rate limiter
// tenant_id or partner_id key
// -------------------------------
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 20;
const bucket = new Map(); // key -> {count, resetAt}

function rateLimit(req, res, next) {
  const key = String(req.tenant_id || req.partner_id || "anon");
  const now = Date.now();
  const cur = bucket.get(key) || { count: 0, resetAt: now + RATE_WINDOW_MS };

  if (now > cur.resetAt) {
    cur.count = 0;
    cur.resetAt = now + RATE_WINDOW_MS;
  }

  cur.count += 1;
  bucket.set(key, cur);

  if (cur.count > RATE_MAX) {
    return res.status(429).json({ ok: false, error: "Rate limit exceeded" });
  }
  next();
}

// -------------------------------
// Auth middleware: JWT required
// -------------------------------
function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
    if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // keep it flexible: your tokens sometimes contain tenant_id + partner_id + role
    req.tenant_id = decoded.tenant_id;
    req.partner_id = decoded.partner_id;
    req.role = decoded.role;

    if (!req.tenant_id && !req.partner_id) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

// -------------------------------
// POST /api/chat
// body: { session_id, message, locale }
// -------------------------------
router.post("/", authenticate, rateLimit, async (req, res) => {
  try {
    const session_id = String(req.body?.session_id || "webchat");
    const message = String(req.body?.message || "").trim();
    const locale = String(req.body?.locale || "en-US");

    if (!message) return res.status(400).json({ ok: false, error: "message required" });
    if (message.length > MAX_MSG_CHARS) return res.status(400).json({ ok: false, error: "message too long" });

    // ✅ Story 12.7: memory context (optional)
    let memoryCtx = null;
    try {
      if (memory && resolveActiveIntent && buildContext) {
        const st = memory.touch(req.tenant_id, session_id);

        const nextIntent = resolveActiveIntent({
          userText: message,
          priorActiveIntent: st.activeIntent || "",
        });
        if (nextIntent) memory.setActiveIntent(req.tenant_id, session_id, nextIntent);

        memory.appendTurn(req.tenant_id, session_id, "user", message, { intentTag: nextIntent });

        const latest = memory.getState(req.tenant_id, session_id);
        memoryCtx = buildContext(latest, { recentTurns: 8, summarizeBeyond: 10 });
      }
    } catch (e) {}

    // ✅ FIX: correct argument order + pass memoryCtx
    // retrieveAnswer(userQuery, tenantId, langCode="en-US", sessionId=null, memoryCtx=null)
    const result = await retrieveAnswer(
      message,        // userQuery (string)
      req.tenant_id,  // tenant context
      locale,         // langCode / locale
      session_id,     // sessionId
      memoryCtx       // Story 12.7 memory context
    );

    // normalize output
    const reply =
      (typeof result === "string" ? result : (result?.reply || result?.answer || "")) || "";

    // store assistant turn for 12.7 (optional)
    try {
      if (memory) {
        const st2 = memory.getState(req.tenant_id, session_id);
        const active = st2.activeIntent || "";
        memory.appendTurn(req.tenant_id, session_id, "assistant", reply, { intentTag: active });
      }
    } catch (e) {}

    return res.json({
      ok: true,
      reply,
      session_id
    });
  } catch (err) {
    // Log minimization: don’t dump full user content
    console.error("chat error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;
