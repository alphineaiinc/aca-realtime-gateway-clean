// ============================================================
// src/routes/partnerPayout.js
// ============================================================

console.log("🔍 Loading partnerPayout.js route file...");

const express = require("express");
const jwt = require("jsonwebtoken");
const { processPayout } = require("../brain/utils/payoutManager");
const pool = require("../db/pool");
const { recordEvent } = require("../analytics/eventCollector.js");

const router = express.Router();
const ingressRateLimit=require("../security/ingressLimit").ingressLimit({max:30});


// -----------------------------
// 🔐 Strict Auth Middleware
// -----------------------------
function authenticate(req, res, next) {
  try {
    const auth = req.headers.authorization || "";

    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const token = auth.slice(7).trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
}

function requireAdmin(req, res, next) {
  const role = String(req.user?.role || "").toLowerCase();
  if (role !== "admin") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  next();
}

// ============================================================
// POST /api/partner/payout
// ============================================================
router.post("/partner/payout", ingressRateLimit, authenticate, requireAdmin, (_req,res)=>res.status(503).json({ok:false,error:"Verified payout settlement unavailable"}));

// ============================================================
// GET /api/partner/payouts
// ============================================================
router.get("/partner/payouts", ingressRateLimit, authenticate, async (req, res) => {
  try {
    const role = String(req.user?.role || "").toLowerCase();
    const partner_id = req.user.partner_id;

    let query;
    let params = [];

    if (role === "admin") {
      query = "SELECT id, partner_id, amount, status, requested_at FROM partner_payouts ORDER BY requested_at DESC LIMIT 50";
    } else {
      if (!Number.isSafeInteger(partner_id) || partner_id <= 0) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }

      query = "SELECT id, partner_id, amount, status, requested_at FROM partner_payouts WHERE partner_id=$1 ORDER BY requested_at DESC LIMIT 50";
      params = [partner_id];
    }

    const result = await pool.query(query, params);

    recordEvent({
      tenant_id: null,
      partner_id: partner_id || 0,
      event_type: "PAYOUT_HISTORY_VIEW",
      quantity: result.rows.length,
      unit: "records",
      cost: 0,
      meta: { viewer_ip: req.ip },
    });

    res.json({ ok: true, payouts: result.rows });

  } catch (err) {
    console.error("Payout history unavailable");

    recordEvent({
      tenant_id: null,
      partner_id: req.user?.partner_id || 0,
      event_type: "PAYOUT_HISTORY_ERROR",
      quantity: 0,
      unit: "records",
      cost: 0,
      meta: {},
    });

    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

module.exports = router;
console.log("✅ partnerPayout.js secured and exported.");