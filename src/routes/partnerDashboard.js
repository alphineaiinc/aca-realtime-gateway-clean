const express = require("express");
const { partnerAuth } = require("../auth/partnerAuth");
const { getPartnerSummary } = require("../brain/utils/rewardAggregator");
const pool = require("../db/pool");
const { createPostgresRateLimiter } = require("../middleware/postgresRateLimit");
const router = express.Router();
// partnerAuth performs a database lookup before verifying the partner-specific JWT.
// Apply a shared, IP-keyed ingress budget before that lookup, then a principal budget after auth.
const dashboardIngressLimit = createPostgresRateLimiter({ pool, scope: "partner-dashboard-ingress", windowMs: 60000, max: 120, ipBased: true });
const dashboardRateLimit = createPostgresRateLimiter({ pool, scope: "partner-dashboard", windowMs: 60000, max: 60 });

// GET /partner/profile
router.get("/profile", dashboardIngressLimit, partnerAuth, dashboardRateLimit, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT name, email, country, referral_code, status, created_at FROM partners WHERE id=$1",
    [req.partner_id]
  );
  res.json({ ok: true, profile: rows[0] });
});

// GET /partner/referrals
router.get("/referrals", dashboardIngressLimit, partnerAuth, dashboardRateLimit, async (req, res) => {
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
router.get("/rewards", dashboardIngressLimit, partnerAuth, dashboardRateLimit, async (req, res) => {
  const summary = await getPartnerSummary(req.partner_id);
  res.json({ ok: true, summary });
});

module.exports = router;
