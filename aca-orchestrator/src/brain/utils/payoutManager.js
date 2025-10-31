// ============================================================
// src/brain/utils/payoutManager.js
// Alphine AI — Partner Reward Payout Gateway (Story 10.10)
// ============================================================
// Purpose: Safe, fault-tolerant global payout manager for
// Stripe Connect (mock supported) and Wise Business.
// ============================================================

const pool = require("../../db/pool");
const axios = require("axios");

let stripe;

// Safe Stripe initialization (always defines stripe)
try {
  const Stripe = require("stripe");
  const key = process.env.STRIPE_SECRET_KEY;

  if (key && key.trim()) {
    stripe = new Stripe(key);
    console.log("💳 Stripe initialized for Partner Payouts.");
  } else {
    console.warn("⚠️ STRIPE_SECRET_KEY not set — mock mode enabled.");
    stripe = {
      transfers: {
        create: async (opts) => {
          console.log("🧪 Mock Stripe transfer:", opts);
          return { id: `mock_${Date.now()}`, ...opts };
        },
      },
    };
  }
} catch (err) {
  console.error("❌ Stripe init failed:", err.message);
  stripe = {
    transfers: {
      create: async (opts) => {
        console.log("🧪 Mock Stripe fallback:", opts);
        return { id: `mock_${Date.now()}`, ...opts };
      },
    },
  };
}

// ============================================================
// Stripe payout
// ============================================================
async function createStripePayout(partner_id, amount, currency = "USD") {
  try {
    const res = await pool.query(
      "SELECT stripe_account_id FROM partners WHERE id=$1",
      [partner_id]
    );
    if (!res.rows.length || !res.rows[0].stripe_account_id)
      throw new Error("Partner not linked to a Stripe account.");

    const accountId = res.rows[0].stripe_account_id;
    console.log(`🪙 Stripe payout → Partner ${partner_id} | Account ${accountId}`);

    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency,
      destination: accountId,
      description: `Alphine AI Reward Payout for Partner ${partner_id}`,
    });

    await pool.query(
      `INSERT INTO partner_payouts (partner_id, provider, payout_ref, currency, amount, status, processed_at)
       VALUES ($1,'stripe',$2,$3,$4,'success',NOW())`,
      [partner_id, transfer.id, currency, amount]
    );

    console.log(`✅ Stripe payout complete (${transfer.id})`);
    return { ok: true, transferId: transfer.id, amount, currency };
  } catch (err) {
    console.error("❌ Stripe payout failed:", err.message);
    await pool.query(
      `INSERT INTO partner_payouts (partner_id, provider, payout_ref, currency, amount, status)
       VALUES ($1,'stripe',$2,$3,$4,'failed')`,
      [partner_id, err.message, currency, amount]
    );
    return { ok: false, error: err.message };
  }
}

// ============================================================
// Wise payout
// ============================================================
async function createWisePayout(partner_id, amount, currency = "USD") {
  try {
    const res = await pool.query(
      "SELECT wise_profile_id FROM partners WHERE id=$1",
      [partner_id]
    );
    if (!res.rows.length || !res.rows[0].wise_profile_id)
      throw new Error("Partner not linked to a Wise profile.");

    const profileId = res.rows[0].wise_profile_id;
    console.log(`🏦 Wise payout → Partner ${partner_id} | Profile ${profileId}`);

    const apiKey = process.env.WISE_API_KEY;
    if (!apiKey) throw new Error("WISE_API_KEY missing.");

    const response = await axios.post(
      "https://api.transferwise.com/v1/payouts",
      {
        profile: profileId,
        amount,
        currency,
        reference: `Alphine AI Reward Payout ${Date.now()}`,
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    const payoutRef = response.data.id || `wise_${Date.now()}`;
    await pool.query(
      `INSERT INTO partner_payouts (partner_id, provider, payout_ref, currency, amount, status, processed_at)
       VALUES ($1,'wise',$2,$3,$4,'success',NOW())`,
      [partner_id, payoutRef, currency, amount]
    );

    console.log(`✅ Wise payout complete (${payoutRef})`);
    return { ok: true, payoutRef, amount, currency };
  } catch (err) {
    console.error("❌ Wise payout failed:", err.message);
    await pool.query(
      `INSERT INTO partner_payouts (partner_id, provider, payout_ref, currency, amount, status)
       VALUES ($1,'wise',$2,$3,$4,'failed')`,
      [partner_id, err.message, currency, amount]
    );
    return { ok: false, error: err.message };
  }
}

// ============================================================
// Dispatcher
// ============================================================
async function processPayout(partner_id, amount, currency = "USD", provider = "stripe") {
  return provider === "wise"
    ? createWisePayout(partner_id, amount, currency)
    : createStripePayout(partner_id, amount, currency);
}

module.exports = { createStripePayout, createWisePayout, processPayout };
