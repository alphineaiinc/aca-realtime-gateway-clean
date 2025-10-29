const express = require("express");
const { partnerAuth } = require("../auth/partnerAuth");
const { getPartnerSummary } = require("../brain/utils/rewardAggregator");
const pool = require("../db/pool");
const router = express.Router();

// GET /partner/profile
router.get("/profile", partnerAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT name, email, country, referral_code, status, created_at FROM partners WHERE id=$1",
    [req.partner_id]
  );
  res.json({ ok: true, profile: rows[0] });
});

// GET /partner/referrals
router.get("/referrals", partnerAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT pr.id, t.business_name, pr.reward_status, pr.created_at
       FROM partner_referrals pr
       LEFT JOIN master_tenants t ON t.id = pr.tenant_id
       WHERE pr.partner_id=$1
       ORDER BY pr.created_at DESC`,
    [req.partner_id]
  );
  res.json({ ok: true, referrals: rows });
});

// GET /partner/rewards
router.get("/rewards", partnerAuth, async (req, res) => {
  const summary = await getPartnerSummary(req.partner_id);
  res.json({ ok: true, summary });
});

module.exports = router;
