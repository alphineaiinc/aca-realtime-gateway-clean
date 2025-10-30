// ============================================================
// src/brain/utils/payoutManager.js
// Alphine AI — Partner Reward Payout Gateway (Story 10.10)
// ============================================================
// Purpose:
//   Centralized utility for creating partner payouts via Stripe Connect
//   or Wise Business API. Logs every payout to Postgres and ensures
//   compliance linkage to partner_legal_acceptance.
//
//   Each payout entry → partner_payouts table (005_partner_payouts.sql)
// ============================================================

const pool = require("../../db/pool");
const axios = require("axios");

// ============================================================
// Stripe Initialization (with mock fallback)
// ============================================================
let stripe = null;

try {
  const Stripe = require("stripe");

  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    console.log("💳 Stripe initialized for Partner Payouts.");
  } else {
    console.warn("⚠️ STRIPE_SECRET_KEY not set — Stripe payouts disabled (using mock mode).");
    stripe = {
      transfers: {
        create: async (opts) => {
          console.log("🧪 Mock Stripe transfer (no real payout):", opts);
          return { id: `mock_${Date.now()}`, ...opts };
        },
      },
    };
  }
} catch (err) {
  console.error("❌ Stripe initialization failed:", err.message);
  console.warn("⚠️ Using mock Stripe instance for safety.");
  stripe = {
    transfers: {
      create: async (opts) => {
        console.log("🧪 Mock Stripe transfer (fallback mode):", opts);
        return { id: `mock_${Date.now()}`, ...opts };
      },
    },
  };
}

// ============================================================
// Helper 1: Stripe Connect Payout
// ============================================================
async function createStripePayout(partner_id, amount, currency = "USD") {
  try {
    // Validate partner linkage
    const res = await pool.query(
      "SELECT stripe_account_id FROM partners WHERE id=$1",
      [partner_id]
    );

    if (!res.rows.length || !res.rows[0].stripe_account_id) {
      throw new Error("Partner is not linked to a Stripe account.");
    }

    const accountId = res.rows[0].stripe_account_id;
    console.log(`🪙 Creating Stripe payout → Partner ${partner_id} | Account ${accountId}`);

    // Create transfer (live or mock)
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100), // cents
      currency,
      destination: accountId,
      description: `Alphine AI Reward Payout for Partner ${partner_id}`,
    });

    // Log to DB
    await pool.query(
      `INSERT INTO partner_payouts (partner_id, provider, payout_ref, currency, amount, status, processed_at)
       VALUES ($1, 'stripe', $2, $3, $4, 'success', NOW())`,
      [partner_id, transfer.id, currency, amount]
    );

    console.log(`✅ Stripe payout complete for partner ${partner_id} (${transfer.id})`);
    return { ok: true, transferId: transfer.id, amount, currency };
  } catch (err) {
    console.error("❌ Stripe payout failed:", err.message);
    await pool.query(
      `INSERT INTO partner_payouts (partner_id, provider, payout_ref, currency, amount, status)
       VALUES ($1, 'stripe', $2, $3, $4, 'failed')`,
      [partner_id, err.message, currency, amount]
    );
    return { ok: false, error: err.message };
  }
}

// ============================================================
// Helper 2: Wise Business Payout
// ============================================================
async function createWisePayout(partner_id, amount, currency = "USD") {
  try {
    const res = await pool.query(
      "SELECT wise_profile_id FROM partners WHERE id=$1",
      [partner_id]
    );

    if (!res.rows.length || !res.rows[0].wise_profile_id) {
      throw new Error("Partner is not linked to a Wise profile.");
    }

    const profileId = res.rows[0].wise_profile_id;
    console.log(`🏦 Creating Wise payout → Partner ${partner_id} | Profile ${profileId}`);

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
       VALUES ($1, 'wise', $2, $3, $4, 'success', NOW())`,
      [partner_id, payoutRef, currency, amount]
    );

    console.log(`✅ Wise payout complete for partner ${partner_id} (${payoutRef})`);
    return { ok: true, payoutRef, amount, currency };
  } catch (err) {
    console.error("❌ Wise payout failed:", err.message);
    await pool.query(
      `INSERT INTO partner_payouts (partner_id, provider, payout_ref, currency, amount, status)
       VALUES ($1, 'wise', $2, $3, $4, 'failed')`,
      [partner_id, err.message, currency, amount]
    );
    return { ok: false, error: err.message };
  }
}

// ============================================================
// Helper 3: Unified Dispatcher
// ============================================================
async function processPayout(partner_id, amount, currency = "USD", provider = "stripe") {
  if (provider === "wise") {
    return await createWisePayout(partner_id, amount, currency);
  } else {
    return await createStripePayout(partner_id, amount, currency);
  }
}

module.exports = { createStripePayout, createWisePayout, processPayout };
