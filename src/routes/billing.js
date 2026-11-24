// src/routes/billing.js
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

const router = express.Router();
const ingressRateLimit=require("../security/ingressLimit").ingressLimit({max:60});



// ---------------------------------------------------------------------
// Simple in-memory rate limiter per partner for /pay (3 reqs / 10s)
// ---------------------------------------------------------------------
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 3;
const rateBucket = new Map(); // partner_id -> {count, resetAt}

function rateLimit(req, res, next) {
  const pid = String(req.tenant_id || req.ip || "anon");
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
async function authenticate(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) throw Error("Invalid authorization");
    const token = auth.slice(7).trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"], issuer: "alphine-ai", audience: "aca-business" });
    if (decoded.purpose !== "verified_business" || !Number.isSafeInteger(decoded.tenant_id) || decoded.tenant_id <= 0 || typeof decoded.sub !== "string") throw new Error("invalid business identity");
    const { rows } = await pool.query("SELECT tenant_id FROM public.aca_business_identities WHERE email=$1 AND tenant_id=$2 AND is_active", [decoded.sub, decoded.tenant_id]);
    if (rows.length !== 1) throw new Error("inactive business identity");
    req.tenant_id = decoded.tenant_id;
    req.partner_id = null;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

// ---------------------------------------------------------------------
// POST /api/billing/generate – create invoice
// ---------------------------------------------------------------------
router.post("/generate", ingressRateLimit, authenticate, rateLimit, (_req,res)=>res.status(503).json({ok:false,error:"Trusted usage invoicing unavailable"}));

// ---------------------------------------------------------------------
// GET /api/billing/history – list invoices
// ---------------------------------------------------------------------
router.get("/history", ingressRateLimit, authenticate, rateLimit, async (req, res) => {
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
      `SELECT id, amount_usd, status, generated_at 
         FROM billing_invoices 
        WHERE ${where.join(" AND ")}
        ORDER BY id DESC`,
      params
    );
    res.json({ ok: true, invoices: result.rows });
  } catch (err) {
    console.error("[billing/history] operation failed");
    res.status(500).json({ ok: false, error: "Billing operation failed" });
  }
});

// ---------------------------------------------------------------------
// POST /api/billing/pay – mark invoice paid (rate-limited)
// ---------------------------------------------------------------------
// Payment state may only be changed by verified payment-provider webhooks.
router.post("/pay", ingressRateLimit, authenticate, rateLimit, (_req,res) => res.status(410).json({ok:false,error:"Direct payment marking is disabled; use the configured payment provider."}));

// ---------------------------------------------------------------------
// GET /api/billing/status/:id – single invoice
// ---------------------------------------------------------------------
router.get("/status/:id", ingressRateLimit, authenticate, rateLimit, async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    if (!/^[1-9][0-9]*$/.test(req.params.id) || !Number.isSafeInteger(invoiceId)) return res.status(400).json({ok:false,error:'Invalid invoice ID'});
    const result = await pool.query(
      `SELECT id, amount_usd, status, paid_at, payment_method,
              payment_reference, notes, generated_at
         FROM billing_invoices
        WHERE id=$1 AND tenant_id=$2`,
      [invoiceId, req.tenant_id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: "Invoice not found or access denied" });
    res.json({ ok: true, invoice: result.rows[0] });
  } catch (err) {
    console.error("[billing/status] operation failed");
    res.status(500).json({ ok: false, error: "Billing operation failed" });
  }
});

// ---------------------------------------------------------------------
// GET /api/billing/stats – totals + monthly series
// ---------------------------------------------------------------------
router.get("/stats", ingressRateLimit, authenticate, rateLimit, async (req, res) => {
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
    console.error("[billing/stats] operation failed");
    res.status(500).json({ ok: false, error: "Billing operation failed" });
  }
});

// ---------------------------------------------------------------------
// GET /api/billing/summary – alias for /stats (Story 11.7)
// ---------------------------------------------------------------------
router.get("/summary", ingressRateLimit, authenticate, rateLimit, async (req, res) => {
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
    console.error("[billing/summary] operation failed");
    res.status(500).json({ ok: false, error: "Billing operation failed" });
  }
});

// ---------------------------------------------------------------------
// GET /api/billing/export – CSV export of invoices for tenant
// ---------------------------------------------------------------------
router.get("/export", ingressRateLimit, authenticate, rateLimit, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, tenant_id, partner_id, amount_usd, status, payment_method,
              payment_reference, generated_at, paid_at
         FROM billing_invoices
        WHERE tenant_id = $1
        ORDER BY id DESC`,
      [req.tenant_id]
    );
    const rows = result.rows;
    const header = ["id","tenant_id","partner_id","amount_usd","status","payment_method","payment_reference","generated_at","paid_at"];
    const csv = [
      header.join(","),
      ...rows.map(r => header.map(k => {
        let v = r[k] == null ? "" : String(r[k]);
        if (/^[\s]*[=+@-]/.test(v) || /^[\t\r\n]/.test(v)) v = "'"+v;
        v=v.replace(/"/g,'""');
        return `"${v}"`;
      }).join(","))
    ].join("\n");

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="invoices_tenant_${req.tenant_id}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("[billing/export] operation failed");
    res.status(500).json({ ok: false, error: "Billing operation failed" });
  }
});

// ---------------------------------------------------------------------
// POST /api/billing/email/:id – mock email sender
// ---------------------------------------------------------------------
router.post("/email/:id", ingressRateLimit, authenticate, rateLimit, (_req,res)=>res.status(503).json({ok:false,error:"Verified invoice email unavailable"}));

// ---------------------------------------------------------------------
// GET /api/billing/download-all  –  returns ZIP of all invoices for tenant
// ---------------------------------------------------------------------
router.get("/download-all", ingressRateLimit, authenticate, rateLimit, (_req,res)=>res.status(503).json({ok:false,error:"private_invoice_storage_required"}));
router.get("/document/:id", ingressRateLimit, authenticate, rateLimit, async(req,res)=>{
 const id=Number(req.params.id);
 if(!/^[1-9][0-9]*$/.test(req.params.id)||!Number.isSafeInteger(id))return res.status(400).json({ok:false,error:"Invalid invoice ID"});
 try{
  const result=await pool.query("SELECT id,amount_usd,status,generated_at FROM billing_invoices WHERE id=$1 AND tenant_id=$2",[id,req.tenant_id]);
  if(result.rowCount!==1)return res.status(404).json({ok:false,error:"Invoice not found"});
  const {PDFDocument,StandardFonts}=require("pdf-lib");
  const doc=await PDFDocument.create(),page=doc.addPage(),font=await doc.embedFont(StandardFonts.Helvetica);
  const row=result.rows[0];
  ["Alphine AI - Invoice ledger copy","Invoice "+id,"Amount USD "+String(row.amount_usd),"Status "+String(row.status)].forEach((line,i)=>page.drawText(line,{x:40,y:750-i*30,font,size:12}));
  res.set({"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="invoice-'+id+'.pdf"',"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"});
  return res.send(Buffer.from(await doc.save()));
 }catch{return res.status(503).json({ok:false,error:"Invoice unavailable"});}
});
module.exports=router;
