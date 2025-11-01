// src/routes/billing.js
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { generateInvoice } = require("../brain/billingEngine");
const router = express.Router();

function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.tenant_id = decoded.tenant_id;
    req.partner_id = decoded.partner_id;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

router.post("/generate", authenticate, async (req, res) => {
  try {
    const { usage_minutes, ai_tokens } = req.body;
    const invoice = await generateInvoice(req.tenant_id, req.partner_id, usage_minutes, ai_tokens, 0.05, 0.0005);
    res.json({ ok: true, invoice });
  } catch (err) {
    console.error("[billing/generate]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/history", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, amount_usd, status, generated_at, invoice_path FROM billing_invoices WHERE tenant_id=$1 ORDER BY id DESC",
      [req.tenant_id]
    );
    res.json({ ok: true, invoices: result.rows });
  } catch (err) {
    console.error("[billing/history]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
