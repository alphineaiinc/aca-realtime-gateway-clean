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

// ------------------------------------------------------------------
// Story 12.8.1 — Public Demo Mode Architecture (REST /api/chat enforcement)
// - If token role=demo or demo=true:
//   - require DEMO_MODE_ENABLED
//   - enforce ip_hash binding to client IP
//   - force tenant_id = DEMO_TENANT_ID
// - Add per-demo-token (jti) rate limiting without changing tenant limiter
// ------------------------------------------------------------------
let demoConfig, getClientIp, hashIp;
try {
  ({ demoConfig } = require("../brain/utils/demoConfig"));
} catch (e) {}
try {
  ({ getClientIp, hashIp } = require("../db/demoGuards"));
} catch (e) {}

const DEMO_TOKEN_RATE_WINDOW_MS = parseInt(process.env.DEMO_TOKEN_RATE_WINDOW_MS || "60000", 10); // 60s
const DEMO_TOKEN_RATE_MAX_MSGS_DEFAULT = 60;

// demo_jti -> { count, resetAt }
const demoTokenRate = new Map();

function nowMs() {
  return Date.now();
}

function getDemoTokenMaxMsgs() {
  try {
    const cfg = (typeof demoConfig === "function") ? demoConfig() : null;
    const n = cfg && typeof cfg.perMinToken === "number" ? cfg.perMinToken : null;
    if (n && Number.isFinite(n) && n > 0) return Math.floor(n);
  } catch (e) {}
  return DEMO_TOKEN_RATE_MAX_MSGS_DEFAULT;
}

function rateLimitDemoToken(demo_jti) {
  const key = String(demo_jti || "");
  if (!key) return true;

  const now = nowMs();
  const maxMsgs = getDemoTokenMaxMsgs();

  const bucket = demoTokenRate.get(key) || { count: 0, resetAt: now + DEMO_TOKEN_RATE_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + DEMO_TOKEN_RATE_WINDOW_MS;
  }
  bucket.count += 1;
  demoTokenRate.set(key, bucket);

  return bucket.count <= maxMsgs;
}

// -------------------------------
// Simple in-memory rate limiter
// tenant_id or partner_id key
// -------------------------------
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 20;
const bucket = new Map(); // key -> {count, resetAt}

function rateLimit(req, res, next) {
  // ✅ Additional demo-token limiter (jti-based) without changing tenant limiter
  if (req.role === "demo" && req.demo_jti) {
    if (!rateLimitDemoToken(req.demo_jti)) {
      return res.status(429).json({ ok: false, error: "Rate limit exceeded (demo token)" });
    }
  }

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

    // ---------------------------------------------------------------------
    // ✅ Story 12.8.1 — Demo token enforcement (tenant lock + IP binding)
    // ---------------------------------------------------------------------
    const isDemo = (decoded && (decoded.role === "demo" || decoded.demo === true));
    if (isDemo) {
      const cfg = (typeof demoConfig === "function") ? demoConfig() : null;

      // Demo must be explicitly enabled
      if (!cfg || !cfg.enabled) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      // Require IP binding helpers
      if (typeof getClientIp !== "function" || typeof hashIp !== "function") {
        console.warn("🔐 [chat] demo guards not available (getClientIp/hashIp missing)");
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      const ip = getClientIp(req);
      const expected = hashIp(ip);

      // Must match token’s ip_hash
      if (!decoded.ip_hash || decoded.ip_hash !== expected) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      // Force demo tenant + role
      req.tenant_id = cfg.tenantId;
      req.partner_id = null;
      req.role = "demo";
      req.demo_jti = decoded.demo_jti || decoded.jti || null;

      if (!req.tenant_id) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      return next();
    }

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
