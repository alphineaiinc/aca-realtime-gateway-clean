"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");
const memory = require("../brain/memory/sessionMemory");

const router = express.Router();

function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.tenant_id = decoded.tenant_id;
    req.role = decoded.role;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

router.get("/debug-memory", authenticate, (req, res) => {
  // Require session_id query param to avoid dumping anything broadly
  const session_id = String(req.query.session_id || "").trim();
  if (!session_id) return res.status(400).json({ ok: false, error: "session_id required" });

  const st = memory.getState(req.tenant_id, session_id);

  // Redacted response: we do not return full long text
  const safeTurns = (st.turns || []).map(t => ({
    role: t.role,
    ts: t.ts,
    intentTag: t.intentTag || "",
    textPreview: (t.text || "").slice(0, 140),
  }));

  return res.json({
    ok: true,
    tenant_id: st.tenant_id,
    session_id: st.session_id,
    createdAt: st.createdAt,
    lastSeenAt: st.lastSeenAt,
    activeIntent: st.activeIntent || "",
    summaryPreview: (st.summary || "").slice(0, 300),
    turnsCount: safeTurns.length,
    turns: safeTurns,
  });
});

module.exports = router;
