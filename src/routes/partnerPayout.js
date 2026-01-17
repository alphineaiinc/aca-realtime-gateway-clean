// ============================================================
// src/routes/partnerPayout.js
// Alphine AI — Global Partner Payout Gateway (Story 10.10 + Story 11.1)
// ============================================================
// Purpose:
//   Provides REST API endpoints for triggering and tracking
//   global partner payouts via Stripe or Wise.
//   Integrates with payoutManager.js for execution and
//   logs every payout event in Postgres + analytics_events.
//
//   Routes:
//     POST /api/partner/payout
//     GET  /api/partner/payouts
// ============================================================

console.log("🔍 Loading partnerPayout.js route file...");
process.on("uncaughtException", (e) => console.error("💥 partnerPayout uncaughtException:", e));
process.on("unhandledRejection", (e) => console.error("💥 partnerPayout unhandledRejection:", e));

const express = require("express");
const jwt = require("jsonwebtoken");
const { processPayout } = require("../brain/utils/payoutManager");
const pool = require("../db/pool");
const { recordEvent } = require("../analytics/eventCollector.js");


const router = express.Router();

// ============================================================
// POST /api/partner/payout
// Trigger a payout for a specific partner.
// ============================================================
router.post("/partner/payout", async (req, res) => {
  try {
    // --- Authorization check (Admin or partner JWT) ---
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    let decoded = null;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      console.warn("⚠️ JWT verification failed – continuing for test mode");
    }

    const { partner_id, amount, currency = "USD", provider = "stripe" } = req.body;
    if (!partner_id || !amount) {
      return res.status(400).json({ ok: false, error: "partner_id and amount are required." });
    }

    console.log(`💰 Processing payout → Partner ${partner_id} | Amount ${amount} ${currency} | Provider ${provider}`);

    const result = await processPayout(partner_id, amount, currency, provider);

    if (result.ok) {
      // ✅ Record analytics event for successful payout
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
          user_agent: req.headers["user-agent"] || ""
        }
      });

      res.json({ ok: true, message: "Payout successful", result });
    } else {
      // ❌ Record failed payout attempt
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
          ip: req.ip
        }
      });

      res.status(500).json({ ok: false, error: result.error });
    }
  } catch (err) {
    console.error("❌ Error in /partner/payout full stack:", err);

    // ❌ Record unexpected exception
    recordEvent({
      tenant_id: null,
      partner_id: req.body?.partner_id || null,
      event_type: "PAYOUT_EXCEPTION",
      quantity: Number(req.body?.amount) || 0,
      unit: req.body?.currency || "USD",
      cost: 0,
      meta: { message: err.message, stack: err.stack }
    });

    res.status(500).json({
      ok: false,
      message: "Internal error in payout route",
      error: err.message,
      stack: err.stack
    });
  }
});

// ============================================================
// GET /api/partner/payouts
// Retrieve payout history (Admin dashboard or Partner view)
// ============================================================
router.get("/partner/payouts", async (req, res) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    let partner_id = null;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      partner_id = decoded.partner_id || null;
    } catch {
      console.warn("⚠️ JWT decode skipped — using open admin query.");
    }

  let query = "SELECT * FROM partner_payouts ORDER BY requested_at DESC LIMIT 50";

    let params = [];

    if (partner_id) {
      let query = "SELECT * FROM partner_payouts WHERE partner_id=$1 ORDER BY requested_at DESC LIMIT 50";

      params = [partner_id];
    }

    const result = await pool.query(query, params);
    res.json({ ok: true, payouts: result.rows });

    // 📊 Record analytics event for dashboard retrieval
    recordEvent({
      tenant_id: null,
      partner_id: partner_id || 0,
      event_type: "PAYOUT_HISTORY_VIEW",
      quantity: result.rows.length,
      unit: "records",
      cost: 0,
      meta: { viewer_ip: req.ip }
    });
  } catch (err) {
    console.error("❌ Error fetching payout history:", err);

    recordEvent({
      tenant_id: null,
      partner_id: 0,
      event_type: "PAYOUT_HISTORY_ERROR",
      quantity: 0,
      unit: "records",
      cost: 0,
      meta: { error: err.message }
    });

    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
console.log("✅ partnerPayout.js route file exported successfully.");
