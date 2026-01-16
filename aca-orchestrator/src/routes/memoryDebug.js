// src/routes/memoryDebug.js
// Story 12.7 — Tenant-isolated session memory debug endpoint (safe)
// GET /api/chat/debug-memory?session_id=...

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

// Prefer Story 12.7 store; fallback to older store
let getSessionState;
try {
  ({ getSessionState } = require("../brain/memory/sessionMemory"));
  console.log("✅ [memoryDebug] Using Story 12.7 memory store (src/brain/memory/sessionMemory.js)");
} catch (e) {
  ({ getSessionState } = require("../brain/utils/sessionMemory"));
  console.log("⚠️ [memoryDebug] Falling back to legacy memory store (src/brain/utils/sessionMemory.js)");
}

// ---------------------------------------------------------------------------
// Middleware: verify JWT (tenant-safe)
// ---------------------------------------------------------------------------
function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.tenant_id = decoded.tenant_id;
    req.partner_id = decoded.partner_id;
    req.role = decoded.role;

    if (!req.tenant_id) {
      return res.status(401).json({ ok: false, error: "Unauthorized (no tenant_id)" });
    }
    next();
  } catch (err) {
    console.warn("🔐 [memoryDebug] JWT verify failed:", err?.message || err);
    console.warn("🔐 [memoryDebug] JWT_SECRET present?", !!process.env.JWT_SECRET);
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/chat/debug-memory?session_id=...
// ---------------------------------------------------------------------------
router.get("/chat/debug-memory", authenticate, (req, res) => {
  try {
    const tenant_id = req.tenant_id;
    const session_id = String(req.query?.session_id || "web");

    const state = (typeof getSessionState === "function")
      ? getSessionState(tenant_id, session_id)
      : null;

    return res.json({
      ok: true,
      tenant_id,
      session_id,
      state: state || { tenant_id, session_id, turns: [], summary: "", activeIntent: "" },
      now: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ [memoryDebug] error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;
