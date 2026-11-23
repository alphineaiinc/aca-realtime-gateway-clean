// src/routes/public.js
// ---------------------------------------------------------------------------
// 🌐 Public routes for tenant onboarding, signup, and login
// ---------------------------------------------------------------------------
const express = require("express");
const router = express.Router();
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
router.post("/public/login", (req, res) => {
  const email = req.body && req.body.email;
  if (!email) return res.status(400).json({ ok: false, error: "Missing email" });
  // Email possession has not been verified: never mint a tenant JWT here.
  return res.status(403).json({ ok: false, error: "Verified login required" });
});

// ---------------------------------------------------------------------------
// Export router
// ---------------------------------------------------------------------------
module.exports = router;
