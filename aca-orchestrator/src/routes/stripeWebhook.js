// src/routes/stripeWebhook.js
// Story 11.6 – Stripe Integration & Webhook Sync
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const pool = require("../db/pool");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const logFile = path.join(__dirname, "../logs/billing_events.log");

router.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("🧾 Stripe webhook called at", new Date().toISOString());
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      fs.appendFileSync(
        logFile,
        `[${new Date().toISOString()}] ❌ Webhook signature failed: ${err.message}\n`
      );
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    fs.appendFileSync(
      logFile,
      `[${new Date().toISOString()}] ✅ Received event: ${event.type}\n`
    );

    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const payment = event.data.object;
          await pool.query(
            `INSERT INTO tenant_billing (tenant_id, amount, status, stripe_ref)
             VALUES ($1,$2,'success',$3)
             ON CONFLICT (stripe_ref) DO NOTHING`,
            [payment.metadata?.tenant_id || null, payment.amount_received / 100, payment.id]
          );
          break;
        }
        case "payout.paid": {
          const payout = event.data.object;
          await pool.query(
            `UPDATE partner_payouts
             SET status='success', payout_reference_enc=$1, approved_at=NOW()
             WHERE payout_ref=$2`,
            [payout.id, payout.metadata?.payout_ref]
          );
          break;
        }
        default:
          fs.appendFileSync(
            logFile,
            `[${new Date().toISOString()}] ℹ️  Ignored event ${event.type}\n`
          );
      }
      res.status(200).send("ok");
    } catch (err) {
      fs.appendFileSync(
        logFile,
        `[${new Date().toISOString()}] 🧨 DB Error: ${err.message}\n`
      );
      res.status(500).send("Internal Server Error");
    }
  }
);

module.exports = router;
