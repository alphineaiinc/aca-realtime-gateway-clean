// src/routes/public.js
// ---------------------------------------------------------------------------
// 🌐 Public routes for tenant onboarding, signup, and login
// ---------------------------------------------------------------------------
const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

// Load environment variables
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

// Initialize PostgreSQL pool (Render + Neon connection)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------------
// 🔹 POST /public/signup — create a new tenant (business)
// ---------------------------------------------------------------------------
router.post("/public/signup", async (req, res) => {
  const { email, business_name, contact_number } = req.body;

  if (!email || !business_name) {
    return res.status(400).json({ ok: false, error: "Missing required fields" });
  }

  try {
    const client = await pool.connect();

    // 1️⃣  Insert into master_tenants
    const insertTenant = `
      INSERT INTO master_tenants (email, contact_number, business_type, region, preferred_lang, jwt_secret, api_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, email, region, preferred_lang;
    `;
    const jwtSecret = process.env.TENANT_JWT_SECRET || "alphine_tenant_jwt_2025_secure!";
    const apiKey = "tenant_" + Math.random().toString(36).substring(2, 10);
    const result = await client.query(insertTenant, [
      email,
      contact_number || "",
      "restaurant",
      "global",
      "en-IN",
      jwtSecret,
      apiKey,
    ]);

    const tenant = result.rows[0];

    // 2️⃣  Generate Tenant JWT token
    const token = jwt.sign(
      { tenant_id: tenant.id, email: tenant.email },
      jwtSecret,
      { expiresIn: "1h" }
    );

    // 3️⃣  Create corresponding business record
    await client.query(
      `INSERT INTO businesses (name, email, phone) VALUES ($1, $2, $3)`,
      [business_name, email, contact_number || ""]
    );

    client.release();

    console.log(`✅ Tenant created: ${tenant.email} (id=${tenant.id})`);
    res.json({
      ok: true,
      id: tenant.id,
      email: tenant.email,
      business_name,
      contact_number,
      tenant_key: apiKey,
      token,
      source: "public",
    });
  } catch (err) {
    console.error("❌ /public/signup failed:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 🔹 GET /public/test — simple connectivity test
// ---------------------------------------------------------------------------
router.get("/public/test", (req, res) => {
  res.json({
    ok: true,
    message: "Public routes are active",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// 🔹 (Optional) POST /public/login — verify token validity
// ---------------------------------------------------------------------------
router.post("/public/login", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ ok: false, error: "Missing email" });

  try {
    const { rows } = await pool.query("SELECT id, email FROM master_tenants WHERE email = $1", [email]);
    if (rows.length === 0) return res.status(404).json({ ok: false, error: "Tenant not found" });

    const jwtSecret = process.env.TENANT_JWT_SECRET || "alphine_tenant_jwt_2025_secure!";
    const token = jwt.sign({ tenant_id: rows[0].id, email: rows[0].email }, jwtSecret, { expiresIn: "1h" });

    res.json({ ok: true, token, tenant_id: rows[0].id });
  } catch (err) {
    console.error("❌ /public/login failed:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Export router
// ---------------------------------------------------------------------------
module.exports = router;
