// src/routes/chat.js
const express = require("express");
const jwt = require("jsonwebtoken");

// ✅ Use timeout-guarded brain wrapper
const { retrieveAnswerWithTimeout: retrieveAnswer } = require("../../retriever");

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
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
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
    console.warn("🔐 [chat] JWT verify failed:", err?.message || err);
    console.warn("🔐 [chat] JWT_SECRET present?", !!process.env.JWT_SECRET);
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

// -------------------------------
// POST /api/chat
// body: { session_id, locale, message }
// -------------------------------
router.post("/", authenticate, rateLimit, async (req, res) => {
  try {
    const session_id = String(req.body?.session_id || "webchat");
    const locale = String(req.body?.locale || "en-US");
    const message = String(req.body?.message || "").trim();

    if (!message) return res.status(400).json({ ok: false, error: "message required" });
    if (message.length > MAX_MSG_CHARS) return res.status(400).json({ ok: false, error: "message too long" });

    // ✅ FIX: retriever signature is (userQuery, tenantId, langCode, sessionId)
    const result = await retrieveAnswer(
      message,        // userQuery
      req.tenant_id,  // tenant_id
      locale,         // langCode/locale
      session_id      // sessionId
    );

    const reply =
      (typeof result === "string" ? result : (result?.reply || result?.answer || "")) || "";

    return res.json({
      ok: true,
      reply,
      session_id,
      locale,
    });
  } catch (err) {
    // Log minimization: don’t dump full user content
    console.error("chat error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;
