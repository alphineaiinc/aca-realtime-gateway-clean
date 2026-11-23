// src/routes/tenant.js
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../db/pool");

// ---------------------------------------------------------------------------
// POST /tenant/provision (secured via header API key)
// ---------------------------------------------------------------------------
router.post("/provision", async (req,res) => {
  const crypto = require("node:crypto");
  const expected = Buffer.from(process.env.PROVISION_API_KEY || "");
  const actual = Buffer.from(String(req.headers["x-api-key"] || ""));
  if (!expected.length || actual.length !== expected.length || !crypto.timingSafeEqual(actual,expected)) return res.status(401).json({ok:false,error:"unauthorized"});
  const name = req.body?.business_name;
  if(typeof name !== "string" || !name.trim() || name.length > 255) return res.status(400).json({ok:false,error:"business_name required"});
  try {
    const {rows}=await pool.query("INSERT INTO public.master_tenants (business_name,preferred_lang,region) VALUES ($1,$2,$3) RETURNING id",[name.trim(),req.body.preferred_lang || "en-US",req.body.region || "global"]);
    return res.json({ok:true,tenant_id:rows[0].id,message:"Tenant provisioned; verified routing and login setup required"});
  } catch {return res.status(500).json({ok:false,error:"internal_error"});}
});

// ---------------------------------------------------------------------------
// POST /tenant/login
// ---------------------------------------------------------------------------
router.post("/login", (_req, res) => {
  return res.status(403).json({ok:false,error:"Verified login required"});
});

// ---------------------------------------------------------------------------
// GET /tenant/profile (JWT required)
// ---------------------------------------------------------------------------
router.get("/profile", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";

    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const token = auth.slice(7).trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const tenantId = decoded.tenant_id;

    const { rows } = await pool.query(
      `SELECT id AS tenant_id, business_name, preferred_lang, region FROM public.master_tenants WHERE id=$1`,
      [tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "tenant_not_found" });
    }

    return res.json({ ok: true, profile: rows[0] });
  } catch (err) {
    console.error("Profile error:", err);
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
});

module.exports = router;