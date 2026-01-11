// src/routes/chat.js
const express = require("express");
const jwt = require("jsonwebtoken");

// If your orchestrator already exposes retrieveAnswer or a brain function, wire it here.
// Adjust this import to match your actual codebase.
// Common candidates (based on your project history):
//   - const { retrieveAnswer } = require("../../retriever");   (if mounted from root)
//   - const { retrieveAnswer } = require("../brain/brainEngine");
//   - const { retrieveAnswer } = require("../../retriever.js");
const { retrieveAnswer } = require("../../retriever"); // <-- If this path fails, see validation section below.

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
// body: { session_id, message }
// -------------------------------
router.post("/", authenticate, rateLimit, async (req, res) => {
  try {
    const session_id = String(req.body?.session_id || "webchat");
    const message = String(req.body?.message || "").trim();

    if (!message) return res.status(400).json({ ok: false, error: "message required" });
    if (message.length > MAX_MSG_CHARS) return res.status(400).json({ ok: false, error: "message too long" });

    // IMPORTANT: tenant isolation — pass tenant_id into brain layer
    // We follow the same pattern as your call flow: provide a context object.
   // retriever.js expects the first argument to be the userQuery string
const result = await retrieveAnswer(
  message,          // userQuery (string)
  req.tenant_id,    // tenant context (used by your KB isolation)
  session_id,       // stable web chat session id
  "en-US"           // locale (safe default; we can wire a UI selector later)
);


    // normalize output
    const reply =
      (typeof result === "string" ? result : (result?.reply || result?.answer || "")) || "";

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
