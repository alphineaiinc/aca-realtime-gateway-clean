// src/routes/billing.js
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { generateInvoice } = require("../brain/billingEngine");
const { logPayment } = require("../brain/utils/paymentLogger");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");   // ensure available

const router = express.Router();


// ---------------------------------------------------------------------
// Simple in-memory rate limiter per partner for /pay (3 reqs / 10s)
// ---------------------------------------------------------------------
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 3;
const rateBucket = new Map(); // partner_id -> {count, resetAt}

function rateLimit(req, res, next) {
  const pid = req.partner_id || "anon";
  const now = Date.now();
  const bucket = rateBucket.get(pid) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_WINDOW_MS;
  }
  bucket.count += 1;
  rateBucket.set(pid, bucket);
  if (bucket.count > RATE_MAX) {
    return res.status(429).json({ ok: false, error: "Rate limit exceeded. Try again shortly." });
  }
  next();
}

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
// POST /api/billing/generate – create invoice
// ---------------------------------------------------------------------
router.post("/generate", authenticate, async (req, res) => {
  try {
    const { usage_minutes, ai_tokens } = req.body;
    const invoice = await generateInvoice(
      req.tenant_id,
      req.partner_id,
      Number(usage_minutes || 0),
      Number(ai_tokens || 0),
      0.05,      // USD per minute
      0.0005     // USD per token
    );
    res.json({ ok: true, invoice });
  } catch (err) {
    console.error("[billing/generate]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------
// GET /api/billing/history – list invoices
// ---------------------------------------------------------------------
router.get("/history", authenticate, async (req, res) => {
  try {
    const { status, from, to } = req.query;
    const where = ["tenant_id = $1"];
    const params = [req.tenant_id];
    let p = 2;

    if (status && ["paid", "unpaid"].includes(status)) {
      where.push(`status = $${p++}`); params.push(status);
    }
    if (from) { where.push(`generated_at >= $${p++}`); params.push(new Date(from)); }
    if (to)   { where.push(`generated_at <  $${p++}`); params.push(new Date(to)); }

    const result = await pool.query(
      `SELECT id, amount_usd, status, generated_at, invoice_path 
         FROM billing_invoices 
        WHERE ${where.join(" AND ")}
        ORDER BY id DESC`,
      params
    );
    res.json({ ok: true, invoices: result.rows });
  } catch (err) {
    console.error("[billing/history]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------
// POST /api/billing/pay – mark invoice paid (rate-limited)
// ---------------------------------------------------------------------
router.post("/pay", authenticate, rateLimit, async (req, res) => {
  try {
    const { invoice_id, payment_method = "mock", notes = "" } = req.body;
    if (!invoice_id) return res.status(400).json({ ok: false, error: "invoice_id required" });

    const paymentRef = `pay_${Date.now()}`;
    const upd = await pool.query(
      `UPDATE billing_invoices
          SET status='paid',
              paid_at=NOW(),
              paid_by=$1,
              payment_method=$2,
              payment_reference=$3,
              notes=$4
        WHERE id=$5 AND tenant_id=$6
        RETURNING id, tenant_id, partner_id, status, paid_at, payment_method, payment_reference, amount_usd;`,
      [
        `partner_${req.partner_id}`,
        payment_method,
        paymentRef,
        notes,
        invoice_id,
        req.tenant_id,
      ]
    );
    if (upd.rowCount === 0)
      return res.status(404).json({ ok: false, error: "Invoice not found or access denied" });

    const row = upd.rows[0];
    logPayment({
      t: new Date().toISOString(),
      event: "invoice_paid",
      partner_id: req.partner_id,
      tenant_id: row.tenant_id,
      invoice_id: row.id,
      amount_usd: row.amount_usd,
      method: row.payment_method,
      ref: row.payment_reference
    });

    console.log(`[billing/pay] partner=${req.partner_id} invoice=${invoice_id} method=${payment_method}`);
    res.json({
      ok: true,
      payment: {
        id: row.id,
        status: row.status,
        paid_at: row.paid_at,
        payment_method: row.payment_method,
        payment_reference: row.payment_reference
      }
    });
  } catch (err) {
    console.error("[billing/pay]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------
// GET /api/billing/status/:id – single invoice
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
      return res.status(404).json({ ok: false, error: "Invoice not found or access denied" });
    res.json({ ok: true, invoice: result.rows[0] });
  } catch (err) {
    console.error("[billing/status]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------
// GET /api/billing/stats – totals + monthly series
// ---------------------------------------------------------------------
router.get("/stats", authenticate, async (req, res) => {
  try {
    const totals = await pool.query(
      `SELECT
         COALESCE(SUM(amount_usd) FILTER (WHERE status='paid'),0)   AS total_paid,
         COALESCE(SUM(amount_usd) FILTER (WHERE status='unpaid'),0) AS total_unpaid,
         COALESCE(SUM(amount_usd),0)                                 AS total_all,
         COALESCE(COUNT(*) FILTER (WHERE status='paid'),0)           AS paid_count,
         COALESCE(COUNT(*) FILTER (WHERE status='unpaid'),0)         AS unpaid_count
       FROM billing_invoices
       WHERE tenant_id = $1`, [req.tenant_id]
    );

    const monthly = await pool.query(
      `SELECT month, revenue_paid_usd, revenue_unpaid_usd, paid_count, unpaid_count, invoice_count
         FROM billing_monthly_summary
        WHERE tenant_id = $1
        ORDER BY month ASC`,
      [req.tenant_id]
    );

    res.json({
      ok: true,
      totals: totals.rows[0],
      monthly: monthly.rows.map(r => ({
        month: r.month,
        revenue: Number(r.revenue_paid_usd || 0),
        unpaid: Number(r.revenue_unpaid_usd || 0),
        paid_count: Number(r.paid_count || 0),
        unpaid_count: Number(r.unpaid_count || 0),
        invoice_count: Number(r.invoice_count || 0)
      }))
    });
  } catch (err) {
    console.error("[billing/stats]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------
// GET /api/billing/summary – alias for /stats (Story 11.7)
// ---------------------------------------------------------------------
router.get("/summary", authenticate, async (req, res) => {
  try {
    const totals = await pool.query(
      `SELECT
         COALESCE(SUM(amount_usd) FILTER (WHERE status='paid'),0)   AS total_paid,
         COALESCE(SUM(amount_usd) FILTER (WHERE status='unpaid'),0) AS total_unpaid,
         COALESCE(SUM(amount_usd),0)                                 AS total_all,
         COALESCE(COUNT(*) FILTER (WHERE status='paid'),0)           AS paid_count,
         COALESCE(COUNT(*) FILTER (WHERE status='unpaid'),0)         AS unpaid_count
       FROM billing_invoices
       WHERE tenant_id = $1`, [req.tenant_id]
    );

    const monthly = await pool.query(
      `SELECT month, revenue_paid_usd, revenue_unpaid_usd, paid_count, unpaid_count, invoice_count
         FROM billing_monthly_summary
        WHERE tenant_id = $1
        ORDER BY month ASC`,
      [req.tenant_id]
    );

    res.json({
      ok: true,
      totals: totals.rows[0],
      monthly: monthly.rows.map(r => ({
        month: r.month,
        revenue: Number(r.revenue_paid_usd || 0),
        unpaid: Number(r.revenue_unpaid_usd || 0),
        paid_count: Number(r.paid_count || 0),
        unpaid_count: Number(r.unpaid_count || 0),
        invoice_count: Number(r.invoice_count || 0)
      }))
    });
  } catch (err) {
    console.error("[billing/summary]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------
// GET /api/billing/export – CSV export of invoices for tenant
// ---------------------------------------------------------------------
router.get("/export", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, tenant_id, partner_id, amount_usd, status, payment_method,
              payment_reference, generated_at, paid_at, invoice_path
         FROM billing_invoices
        WHERE tenant_id = $1
        ORDER BY id DESC`,
      [req.tenant_id]
    );
    const rows = result.rows;
    const header = ["id","tenant_id","partner_id","amount_usd","status","payment_method","payment_reference","generated_at","paid_at","invoice_path"];
    const csv = [
      header.join(","),
      ...rows.map(r => header.map(k => {
        const v = r[k] == null ? "" : String(r[k]).replace(/"/g,'""');
        return `"${v}"`;
      }).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="invoices_tenant_${req.tenant_id}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("[billing/export]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------
// POST /api/billing/email/:id – mock email sender
// ---------------------------------------------------------------------
router.post("/email/:id", authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const q = await pool.query(
      `SELECT id, invoice_path, amount_usd FROM billing_invoices
        WHERE id=$1 AND tenant_id=$2`, [id, req.tenant_id]
    );
    if (q.rowCount === 0)
      return res.status(404).json({ ok:false, error:"Invoice not found" });
    console.log(`[billing/email] mock sent invoice=${id} path=${q.rows[0].invoice_path}`);
    res.json({ ok:true, email_sent:true, invoice_id:id });
  } catch (err) {
    console.error("[billing/email]", err);
    res.status(500).json({ ok:false, error: err.message });
  }
});

// ---------------------------------------------------------------------
// GET /api/billing/download-all  –  returns ZIP of all invoices for tenant
// ---------------------------------------------------------------------
router.get("/download-all", authenticate, async (req, res) => {
  try {
    const invoiceDir = path.join(__dirname, "../../public/invoices", String(req.tenant_id));
    if (!fs.existsSync(invoiceDir)) {
      fs.mkdirSync(invoiceDir, { recursive: true });
      return res.status(404).json({ ok:false, error:"No invoices found for this tenant" });
    }

    const zipName = `invoices_tenant_${req.tenant_id}_${Date.now()}.zip`;
    console.log("[billing/download-all] Streaming ZIP for tenant", req.tenant_id);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=\"${zipName}\"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      console.error("[billing/download-all] archive error:", err.message);
      res.status(500).end();
    });

    archive.pipe(res);
    archive.directory(invoiceDir, false);
    await archive.finalize();
  } catch (err) {
    console.error("[billing/download-all]", err);
    res.status(500).json({ ok:false, error:err.message });
  }
});


module.exports = router;
