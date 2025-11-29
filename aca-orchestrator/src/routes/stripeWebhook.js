/**
 * src/routes/stripeWebhook.js
 * Story 11.9 — Stripe Billing Webhook + Email Notifications
 */

const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const fs = require("fs");
const path = require("path");

const { sendBillingEmail } = require("../brain/utils/emailer");
const {
  tplInvoiceCreated,
  tplInvoicePaid,
  tplPaymentFailed,
  tplSubscriptionRenewed,
  tplRefundIssued,
  tplTrialEnding,
  tplPartnerPayout
} = require("../brain/utils/emailTemplates");

// Log file path
const logPath = path.join(__dirname, "../logs/billing_notifications.log");
if (!fs.existsSync(path.dirname(logPath))) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
}

// Stripe instance
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe webhook secret
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// MUST use raw body for Stripe
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        endpointSecret
      );
    } catch (err) {
      fs.appendFileSync(
        logPath,
        `[${new Date().toISOString()}] Signature verification failed: ${err.message}\n`
      );
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const type = event.type;
    const data = event.data.object;

    console.log("🔔 Stripe webhook received:", type);


    fs.appendFileSync(
      logPath,
      `[${new Date().toISOString()}] Webhook received: ${type}\n`
    );

    try {
      // =============================
      // invoice.created
      // =============================
      if (type === "invoice.created") {
        const email = data.customer_email;
        if (email) {
          await sendBillingEmail(
            email,
            "Your Alphine AI Invoice is Ready",
            tplInvoiceCreated(data),
            "Your invoice has been created."
          );
          fs.appendFileSync(
            logPath,
            `[${new Date().toISOString()}] invoice.created → Email sent to ${email}\n`
          );
        }
      }

      // =============================
      // invoice.payment_succeeded
      // =============================
      if (type === "invoice.payment_succeeded") {
        const email = data.customer_email;
        if (email) {
          await sendBillingEmail(
            email,
            "Payment Successful — Alphine AI Invoice",
            tplInvoicePaid(data),
            "Your payment was successful."
          );

          fs.appendFileSync(
            logPath,
            `[${new Date().toISOString()}] invoice.payment_succeeded → Email sent to ${email}\n`
          );
        }
      }

      // =============================
      // invoice.payment_failed
      // =============================
      if (type === "invoice.payment_failed") {
        const email = data.customer_email;
        if (email) {
          await sendBillingEmail(
            email,
            "Payment Failed — Action Needed",
            tplPaymentFailed(data),
            "Your payment failed. Please update your billing information."
          );

          fs.appendFileSync(
            logPath,
            `[${new Date().toISOString()}] invoice.payment_failed → Email sent to ${email}\n`
          );
        }
      }

      // =============================
      // subscription.updated
      // =============================
      if (type === "customer.subscription.updated") {
        const email = event.data.object?.metadata?.customer_email;
        if (email) {
          await sendBillingEmail(
            email,
            "Subscription Updated — Alphine AI",
            tplSubscriptionRenewed(event.data.object),
            "Your subscription has been updated."
          );

          fs.appendFileSync(
            logPath,
            `[${new Date().toISOString()}] subscription.updated → Email to ${email}\n`
          );
        }
      }

      // =============================
      // charge.refunded
      // =============================
      if (type === "charge.refunded") {
        const email = data.billing_details?.email;
        if (email) {
          await sendBillingEmail(
            email,
            "Refund Issued — Alphine AI",
            tplRefundIssued(data),
            "A refund has been issued to your account."
          );

          fs.appendFileSync(
            logPath,
            `[${new Date().toISOString()}] charge.refunded → Email to ${email}\n`
          );
        }
      }

      // =============================
      // custom mock partner payout
      // =============================
      if (type === "payout.paid") {
        const email = data.metadata?.partner_email;
        if (email) {
          await sendBillingEmail(
            email,
            "Partner Payout Processed — Alphine AI",
            tplPartnerPayout(data),
            "Your payout has been processed."
          );

          fs.appendFileSync(
            logPath,
            `[${new Date().toISOString()}] partner.payout → Email to ${email}\n`
          );
        }
      }

    } catch (err) {
      fs.appendFileSync(
        logPath,
        `[${new Date().toISOString()}] ERROR processing webhook: ${err.message}\n`
      );
    }

    res.json({ received: true });
  }
);

module.exports = router;
