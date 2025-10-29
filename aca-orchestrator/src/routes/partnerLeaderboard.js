// src/routes/partnerLeaderboard.js
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const fs = require("fs");
const path = require("path");
const { rankPartners } = require("../brain/utils/rewardEngine");
const { encrypt } = require("../brain/utils/cryptoVault");

const router = express.Router();

// --- Logger (append-only) ---
const LOG_DIR = path.resolve(__dirname, "../logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const AUDIT_LOG = path.join(LOG_DIR, "payout_audit.log");
function audit(line) {
  fs.appendFileSync(AUDIT_LOG, `[${new Date().toISOString()}] ${line}\n`);
}

// --- Auth middleware (partner+admin) ---
function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ ok: false, error: "Missing token" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = decoded; // { sub, role, partner_id, ... }
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

function requireAdmin(req, res, next) {
  if (req.auth?.role !== "admin") {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  return next();
}

// --- GET /partner/leaderboard?scope=all|month|week&limit=50 ---
router.get("/partner/leaderboard", authenticate, async (req, res) => {
  try {
    const scope = String(req.query.scope || "all").toLowerCase();
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);

    // Default: use vw_partner_leaderboard (from migration). You can join here for timeline scopes.
    // If you later add timeline tables, switch on 'scope' to query month/week windows.
    const { rows } = await pool.query(
      `SELECT partner_id, partner_name, country, referrals, earned, redeemed, pending
       FROM vw_partner_leaderboard
       ORDER BY earned DESC, referrals DESC
       LIMIT $1`, [limit]
    );

    const ranked = rankPartners(rows);

    return res.json({
      ok: true,
      scope,
      data: ranked.map(r => ({
        rank: r.rank,
        partner_id: r.partner_id,
        partner_name: r.partner_name,
        country: r.country,
        referrals: r.referrals,
        level: r.level,
        earned: r.earned_adjusted,
        redeemed: r.redeemed,
        pending: r.pending,
        badge: r.rank === 1 ? "Top Referrer" : (r.level || "Rising Star")
      }))
    });
  } catch (err) {
    console.error("leaderboard error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// --- POST /partner/payouts/request  body: { amount, method } ---
router.post("/partner/payouts/request", authenticate, async (req, res) => {
  try {
    const partnerId = req.auth?.partner_id;
    if (!partnerId) return res.status(400).json({ ok: false, error: "No partner_id in token" });

    const amount = Number(req.body?.amount || 0);
    const method = String(req.body?.method || "unspecified").slice(0, 50);
    if (amount <= 0) return res.status(400).json({ ok: false, error: "Invalid amount" });

    // Simple threshold (e.g., $50 minimum)
    if (amount < 50) return res.status(400).json({ ok: false, error: "Minimum payout is 50" });

    const encMethod = encrypt(method);

    const { rows } = await pool.query(
      `INSERT INTO partner_payouts (partner_id, amount, payout_method_enc)
       VALUES ($1, $2, $3)
       RETURNING id, status, requested_at`,
      [partnerId, amount, encMethod]
    );

    audit(`PAYOUT_REQUEST partner_id=${partnerId} amount=${amount}`);

    return res.json({ ok: true, payout: rows[0] });
  } catch (err) {
    console.error("payout request error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// --- GET /partner/payouts/admin?status=pending (admin only) ---
router.get("/partner/payouts/admin", authenticate, requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || "pending");
    const { rows } = await pool.query(
      `SELECT id, partner_id, amount, status, requested_at, approved_at
       FROM partner_payouts
       WHERE status = $1
       ORDER BY requested_at ASC
       LIMIT 200`,
      [status]
    );
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("payout admin list error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// --- POST /partner/payouts/admin/decision  body: { id, action, payout_reference } ---
router.post("/partner/payouts/admin/decision", authenticate, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.body?.id);
    const action = String(req.body?.action || "").toLowerCase(); // approve|reject|paid
    const payoutRef = String(req.body?.payout_reference || "").slice(0, 100);
    if (!["approve", "reject", "paid"].includes(action)) {
      return res.status(400).json({ ok: false, error: "Invalid action" });
    }
    const encRef = payoutRef ? encrypt(payoutRef) : null;

    let newStatus = "pending";
    if (action === "approve") newStatus = "approved";
    if (action === "reject") newStatus = "rejected";
    if (action === "paid") newStatus = "paid";

    const { rows } = await pool.query(
      `UPDATE partner_payouts
         SET status = $1,
             approved_at = CASE WHEN $1 IN ('approved','rejected','paid') THEN CURRENT_TIMESTAMP ELSE approved_at END,
             approved_by = $2,
             payout_reference_enc = COALESCE($3, payout_reference_enc)
       WHERE id = $4
       RETURNING id, partner_id, amount, status, requested_at, approved_at`,
      [newStatus, req.auth.sub || 0, encRef, id]
    );

    if (!rows[0]) return res.status(404).json({ ok: false, error: "Payout not found" });
    audit(`PAYOUT_DECISION id=${id} action=${action} by=${req.auth.sub || "system"}`);

    return res.json({ ok: true, payout: rows[0] });
  } catch (err) {
    console.error("payout decision error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;
