// src/routes/public.js
// ---------------------------------------------------------------------------
// 🌐 Public routes for tenant onboarding, signup, and login
// ---------------------------------------------------------------------------
const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const { randomBytes } = require("node:crypto");

// Load environment variables
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

// Initialize PostgreSQL pool (Render + Neon connection)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

// ---------------------------------------------------------------------------
// 🔹 POST /public/signup — create a new tenant (business)
// ---------------------------------------------------------------------------
router.post("/public/signup", async (req, res) => {
  const { email, business_name, contact_number } = req.body;

  if (!email || !business_name) {
    return res.status(400).json({ ok: false, error: "Missing required fields" });
  }

  const jwtSecret = process.env.TENANT_JWT_SECRET;
  if (!jwtSecret) return res.status(503).json({ ok: false, error: "Authentication unavailable" });

  let client;
  let committed = false;
  let discard = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // 1️⃣  Insert into master_tenants
    const insertTenant = `
      INSERT INTO master_tenants (email, contact_number, business_type, region, preferred_lang, jwt_secret, api_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, email, region, preferred_lang;
    `;
    const apiKey = "tenant_" + randomBytes(32).toString("hex");
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

    await client.query("COMMIT");
    committed = true;
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
    if (client && !committed) {
      try { await client.query("ROLLBACK"); } catch { discard = true; }
    }
    console.error("Public signup failed");
    res.status(500).json({ ok: false, error: "Signup failed" });
  } finally {
    if (client) client.release(discard);
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
    // Email possession has not been verified: never mint a tenant JWT here.
    return res.status(403).json({ ok: false, error: "Verified login required" });
  } catch (err) {
    console.error("Public login failed");
    res.status(500).json({ ok: false, error: "Login failed" });
  }
});

// ---------------------------------------------------------------------------
// Export router
// ---------------------------------------------------------------------------
module.exports = router;
