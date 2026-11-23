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
  ssl: { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------------
// 🔹 POST /public/signup — create a new tenant (business)
// ---------------------------------------------------------------------------
// Public self-service onboarding is intentionally disabled until a verified
// tenant-ownership flow exists. An arbitrary email is not proof of authority.
// This is a draft-only fail-closed security proposal, not an approved launch flow.
router.post("/public/signup", (_req, res) => {
  return res.status(403).json({ ok: false, error: "Verified onboarding required" });
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
