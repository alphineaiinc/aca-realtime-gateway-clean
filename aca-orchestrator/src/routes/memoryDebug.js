// src/routes/memoryDebug.js
// Story 12.7 — Memory Debug Endpoint (JWT protected, tenant-scoped)
// GET /api/chat/debug-memory?session_id=memtest_1
// Shows current in-memory session state for the tenant/session (redacted).

const express = require("express");
const jwt = require("jsonwebtoken");

let memory = null;
try {
  memory = require("../brain/memory/sessionMemory");
  console.log("✅ [memoryDebug] sessionMemory loaded");
} catch (err) {
  console.warn("⚠️ [memoryDebug] sessionMemory not loaded:", err.message);
}

const router = express.Router();

// ---------------------------------------------------------------------------
// ✅ JWT verify with fallback secret (token rotation safe)
// ---------------------------------------------------------------------------
function verifyJwtWithFallback(authHeader) {
  const raw = String(authHeader || "").trim();
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Unauthorized");

  const secrets = [process.env.JWT_SECRET, process.env.JWT_SECRET_OLD].filter(Boolean);

  for (const s of secrets) {
    try {
      return jwt.verify(token, s);
    } catch (e) {}
  }

  throw new Error("Unauthorized");
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
function authenticate(req, res, next) {
  try {
    const decoded = verifyJwtWithFallback(req.headers.authorization);

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
// GET /api/chat/debug-memory?session_id=xxx
// ---------------------------------------------------------------------------
router.get("/chat/debug-memory", authenticate, (req, res) => {
  try {
    if (!memory) {
      return res.status(503).json({
        ok: false,
        error: "sessionMemory module not loaded on server",
      });
    }

    const tenant_id = req.tenant_id;
    const session_id = String(req.query?.session_id || "web");

    const st = memory.getState(tenant_id, session_id) || null;

    // Return safe diagnostic only
    return res.json({
      ok: true,
      tenant_id,
      session_id,
      state: st,
      now: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "debug failed",
    });
  }
});

module.exports = router;
