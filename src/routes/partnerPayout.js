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
router.post("/partner/payout", authenticate, requireAdmin, async (req, res) => {
  try {
    const { amount, currency = "USD", provider = "stripe" } = req.body;

    const partner_id = req.user.partner_id;

    if (!partner_id || !amount) {
      return res.status(400).json({ ok: false, error: "invalid_request" });
    }

    console.log(`💰 Processing payout → Partner ${partner_id} | ${amount} ${currency}`);

    const result = await processPayout(partner_id, amount, currency, provider);

    if (result.ok) {
      recordEvent({
        tenant_id: null,
        partner_id,
        event_type: "PAYOUT_SUCCESS",
        quantity: Number(amount),
        unit: currency,
        cost: 0,
        meta: {
          provider,
          payout_ref: result.reference || null,
          ip: req.ip,
        },
      });

      return res.json({ ok: true, message: "Payout successful" });
    }

    recordEvent({
      tenant_id: null,
      partner_id,
      event_type: "PAYOUT_FAILED",
      quantity: Number(amount),
      unit: currency,
      cost: 0,
      meta: {
        provider,
        error: result.error || "Unknown",
        ip: req.ip,
      },
    });

    return res.status(500).json({ ok: false, error: "payout_failed" });

  } catch (err) {
    console.error("❌ payout error:", err.message);

    recordEvent({
      tenant_id: null,
      partner_id: req.user?.partner_id || null,
      event_type: "PAYOUT_EXCEPTION",
      quantity: Number(req.body?.amount) || 0,
      unit: req.body?.currency || "USD",
      cost: 0,
      meta: { message: err.message },
    });

    return res.status(500).json({
      ok: false,
      error: "internal_error",
    });
  }
});

// ============================================================
// GET /api/partner/payouts
// ============================================================
router.get("/partner/payouts", authenticate, async (req, res) => {
  try {
    const role = String(req.user?.role || "").toLowerCase();
    const partner_id = req.user.partner_id;

    let query;
    let params = [];

    if (role === "admin") {
      query = "SELECT * FROM partner_payouts ORDER BY requested_at DESC LIMIT 50";
    } else {
      if (!partner_id) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }

      query = "SELECT * FROM partner_payouts WHERE partner_id=$1 ORDER BY requested_at DESC LIMIT 50";
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
    console.error("❌ payout history error:", err.message);

    recordEvent({
      tenant_id: null,
      partner_id: req.user?.partner_id || 0,
      event_type: "PAYOUT_HISTORY_ERROR",
      quantity: 0,
      unit: "records",
      cost: 0,
      meta: { error: err.message },
    });

    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

module.exports = router;
console.log("✅ partnerPayout.js secured and exported.");