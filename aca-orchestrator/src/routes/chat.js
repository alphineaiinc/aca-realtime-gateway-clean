// src/routes/chat.js
const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const { retrieveAnswer } = require("../../retriever");

const router = express.Router();

// ---------------------------------------------------------------------
// Story 12.3 — Chat-only ACA Interaction Layer
// Secure-by-default: requires JWT
// ---------------------------------------------------------------------

// Feature flag
function chatEnabled() {
  const v = String(process.env.CHAT_MODE_ENABLED || "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

// Minimal log (redacted)
const logPath = path.join(__dirname, "../logs/chat_access.log");
function safeLog(line) {
  try {
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Avoid logging full user message (privacy)
    fs.appendFileSync(logPath, line + "\n", "utf8");
  } catch (e) {
    // do nothing (logging must never break chat)
  }
}

// ---------------------------------------------------------------------
// JWT auth middleware (tenant isolation)
// Expects: Authorization: Bearer <token>
// Token should include tenant_id (and optionally role/partner_id)
// ---------------------------------------------------------------------
function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
    if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Standardize fields (keep consistent with your other routes)
    req.tenant_id = decoded.tenant_id;
    req.partner_id = decoded.partner_id;
    req.role = decoded.role;

    if (!req.tenant_id) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

// ---------------------------------------------------------------------
// Simple in-memory rate limit per tenant (chat is cheap, but protect abuse)
// 30 requests / minute / tenant
// ---------------------------------------------------------------------
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const rateBucket = new Map(); // tenant_id -> {count, resetAt}

function rateLimit(req, res, next) {
  const tid = String(req.tenant_id || "anon");
  const now = Date.now();

  const bucket = rateBucket.get(tid) || { count: 0, resetAt: now + RATE_WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_WINDOW_MS;
  }

  bucket.count += 1;
  rateBucket.set(tid, bucket);

  if (bucket.count > RATE_MAX) {
    return res.status(429).json({ ok: false, error: "Rate limit exceeded" });
  }

  next();
}

// ---------------------------------------------------------------------
// POST /api/chat
// Body: { message, session_id?, locale? }
// Returns: { ok, reply, confidence?, source? }
// ---------------------------------------------------------------------
router.post("/", authenticate, rateLimit, async (req, res) => {
  try {
    if (!chatEnabled()) {
      return res.status(403).json({ ok: false, error: "Chat mode disabled" });
    }

    const message = String(req.body.message || "").trim();
    const session_id = String(req.body.session_id || "").trim() || `chat_${Date.now()}`;
    const locale = String(req.body.locale || "").trim() || "en-US";

    if (!message) {
      return res.status(400).json({ ok: false, error: "Missing message" });
    }

    // Privacy-first logging (do NOT store message)
    safeLog(
      JSON.stringify({
        ts: new Date().toISOString(),
        tenant_id: req.tenant_id,
        session_id,
        locale,
        msg_len: message.length,
        channel: "chat",
      })
    );

    // -----------------------------------------------------------------
    // ✅ IMPORTANT FIX (Story 12.3):
    // Your current retriever signature is: retrieveAnswer(transcript, businessId, langCode)
    // We map:
    //   businessId = tenant_id (chat channel uses tenant as business scope)
    //   langCode   = locale (e.g., "en-US")
    // -----------------------------------------------------------------
    const businessId = req.tenant_id;
    const langCode = locale;

    const answer = await retrieveAnswer(message, businessId, langCode, session_id);


    const reply =
      (answer && typeof answer === "string" ? answer : "") ||
      "Sorry — I couldn’t find an answer for that.";

    return res.json({
      ok: true,
      reply,
      confidence: null,
      source: "brain",
      session_id,
      locale,
    });
  } catch (err) {
    safeLog(
      JSON.stringify({
        ts: new Date().toISOString(),
        tenant_id: req.tenant_id,
        channel: "chat",
        error: String(err && err.message ? err.message : err),
      })
    );

    return res.status(500).json({ ok: false, error: "Chat error" });
  }
});

module.exports = router;
