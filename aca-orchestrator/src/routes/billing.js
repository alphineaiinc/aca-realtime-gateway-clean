// src/routes/billing.js
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { generateInvoice } = require("../brain/billingEngine");
const router = express.Router();

// ---------------------------------------------------------------------
// Middleware: partner / tenant JWT auth
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// POST /api/billing/generate – existing endpoint
// ---------------------------------------------------------------------
router.post("/generate", authenticate, async (req, res) => {
  try {
    const { usage_minutes, ai_tokens } = req.body;
    const invoice = await generateInvoice(
      req.tenant_id,
      req.partner_id,
      usage_minutes,
      ai_tokens,
      0.05,
      0.0005
    );
    res.json({ ok: true, invoice });
  } catch (err) {
    console.error("[billing/generate]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------
// GET /api/billing/history – existing endpoint
// ---------------------------------------------------------------------
router.get("/history", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, amount_usd, status, generated_at, invoice_path 
         FROM billing_invoices 
        WHERE tenant_id=$1 
        ORDER BY id DESC`,
      [req.tenant_id]
    );
    res.json({ ok: true, invoices: result.rows });
  } catch (err) {
    console.error("[billing/history]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------
// POST /api/billing/pay – Story 11.4
// ---------------------------------------------------------------------
router.post("/pay", authenticate, async (req, res) => {
  try {
    const { invoice_id, payment_method = "mock", notes = "" } = req.body;
    if (!invoice_id)
      return res.status(400).json({ ok: false, error: "invoice_id required" });

    const paymentRef = `pay_${Date.now()}`;

    const result = await pool.query(
      `UPDATE billing_invoices
          SET status='paid',
              paid_at=NOW(),
              paid_by=$1,
              payment_method=$2,
              payment_reference=$3,
              notes=$4
        WHERE id=$5 AND tenant_id=$6
        RETURNING id, status, paid_at, payment_method, payment_reference;`,
      [
        `partner_${req.partner_id}`,
        payment_method,
        paymentRef,
        notes,
        invoice_id,
        req.tenant_id,
      ]
    );

    if (result.rowCount === 0)
      return res
        .status(404)
        .json({ ok: false, error: "Invoice not found or access denied" });

    console.log(
      `[billing/pay] partner=${req.partner_id} invoice=${invoice_id} method=${payment_method}`
    );
    res.json({ ok: true, payment: result.rows[0] });
  } catch (err) {
    console.error("[billing/pay]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------
// GET /api/billing/status/:id – Story 11.4
// ---------------------------------------------------------------------
router.get("/status/:id", authenticate, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id);
    const result = await pool.query(
      `SELECT id, amount_usd, status, paid_at, payment_method,
              payment_reference, notes, generated_at, invoice_path
         FROM billing_invoices
        WHERE id=$1 AND tenant_id=$2`,
      [invoiceId, req.tenant_id]
    );

    if (result.rowCount === 0)
      return res
        .status(404)
        .json({ ok: false, error: "Invoice not found or access denied" });

    res.json({ ok: true, invoice: result.rows[0] });
  } catch (err) {
    console.error("[billing/status]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
