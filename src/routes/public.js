// src/routes/public.js
// ---------------------------------------------------------------------------
// 🌐 Public routes for tenant onboarding, signup, and login
// ---------------------------------------------------------------------------
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// Load environment variables (only helpful locally; Render uses env vars)
try {
  const path = require("path");
  if (process.env.NODE_ENV !== "production") {
    require("dotenv").config({
      path: path.resolve(__dirname, "../../.env"),
      override: false,
    });
  }
} catch (_) {
  // ignore
}

// Prefer orchestrator shared pool (keeps latest Neon SSL + env isolation fixes)
let pool;
try {
  pool = require("../db/pool");
} catch (e) {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // fallback only (shared pool should handle SSL properly)
  });
}

// ---------------------------------------------------------------------------
// 🔹 POST /public/signup — create a new tenant (business)
// ---------------------------------------------------------------------------
router.post("/public/signup", async (req, res) => {
  const { email, business_name, contact_number } = req.body;

  if (!email || !business_name) {
    return res.status(400).json({ ok: false, error: "Missing required fields" });
  }

  try {
    // 1️⃣ Insert into master_tenants
    const insertTenant = `
      INSERT INTO master_tenants (email, contact_number, business_type, region, preferred_lang, jwt_secret, api_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, email, region, preferred_lang, jwt_secret, api_key;
    `;

    // Security-first: unique per-tenant secret (do NOT use a global or hardcoded fallback)
    const jwtSecret = crypto.randomBytes(32).toString("hex");
    const apiKey = "tenant_" + crypto.randomBytes(8).toString("hex");

    const result = await pool.query(insertTenant, [
      email,
      contact_number || "",
      "restaurant",
      "global",
      "en-IN",
      jwtSecret,
      apiKey,
    ]);

    const tenant = result.rows[0];

    // 2️⃣ Generate Tenant JWT token (sign with tenant-specific secret)
    const token = jwt.sign(
      { tenant_id: tenant.id, email: tenant.email },
      tenant.jwt_secret,
      { expiresIn: "1h" }
    );

    // 3️⃣ Create corresponding business record
    await pool.query(
      `INSERT INTO businesses (name, email, phone) VALUES ($1, $2, $3)`,
      [business_name, email, contact_number || ""]
    );

    console.log(`✅ Tenant created: ${tenant.email} (id=${tenant.id})`);
    res.json({
      ok: true,
      id: tenant.id,
      email: tenant.email,
      business_name,
      contact_number,
      tenant_key: tenant.api_key,
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
// 🔹 POST /public/login — issue a tenant token (security-first)
// ---------------------------------------------------------------------------
// By default: requires { email, tenant_key } so attackers cannot mint tokens by email alone.
// Demo override: set PUBLIC_DEMO_MODE=1 to allow email-only login for public demo usage.
router.post("/public/login", async (req, res) => {
  const { email, tenant_key } = req.body;

  if (!email) return res.status(400).json({ ok: false, error: "Missing email" });

  const demoMode =
    String(process.env.PUBLIC_DEMO_MODE || "").toLowerCase() === "1" ||
    String(process.env.PUBLIC_DEMO_MODE || "").toLowerCase() === "true";

  if (!demoMode && !tenant_key) {
    return res.status(400).json({ ok: false, error: "Missing tenant_key" });
  }

  try {
    let rows;
    if (demoMode) {
      ({ rows } = await pool.query(
        "SELECT id, email, jwt_secret, api_key FROM master_tenants WHERE email = $1",
        [email]
      ));
    } else {
      ({ rows } = await pool.query(
        "SELECT id, email, jwt_secret, api_key FROM master_tenants WHERE email = $1 AND api_key = $2",
        [email, tenant_key]
      ));
    }

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Tenant not found" });
    }

    const tenant = rows[0];

    if (!tenant.jwt_secret) {
      return res.status(500).json({ ok: false, error: "Tenant jwt_secret missing" });
    }

    const token = jwt.sign(
      { tenant_id: tenant.id, email: tenant.email },
      tenant.jwt_secret,
      { expiresIn: "1h" }
    );

    res.json({ ok: true, token, tenant_id: tenant.id, tenant_key: tenant.api_key });
  } catch (err) {
    console.error("❌ /public/login failed:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Export router
// ---------------------------------------------------------------------------
module.exports = router;
