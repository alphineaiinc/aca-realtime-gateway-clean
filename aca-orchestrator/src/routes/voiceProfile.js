const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "../logs/voice_profile.log");

function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ ok: false, error: "Missing Authorization header" });
  const token = authHeader.split(" ")[1];
  try {
    req.tenant = jwt.verify(token, process.env.TENANT_JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ ok: false, error: "Invalid or expired token" });
  }
}

// Save or update preferred voice
router.post("/tenant/voice-profile", verifyToken, async (req, res) => {
  const { preferred_voice } = req.body;
  const tenant_id = req.tenant?.tenant_id;
  if (!tenant_id) return res.status(400).json({ ok: false, error: "Missing tenant_id in token" });
  if (!preferred_voice) return res.status(400).json({ ok: false, error: "Missing preferred_voice" });

  try {
    await pool.query("UPDATE master_tenants SET preferred_voice = $1 WHERE id = $2", [preferred_voice, tenant_id]);
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] tenant:${tenant_id} voice:${preferred_voice}\n`);
    return res.json({ ok: true, message: "Voice preference saved successfully" });
  } catch (err) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ERROR:${err.message}\n`);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Retrieve preferred voice
router.get("/tenant/voice-profile", verifyToken, async (req, res) => {
  const tenant_id = req.tenant?.tenant_id;
  try {
    const result = await pool.query("SELECT preferred_voice FROM master_tenants WHERE id = $1", [tenant_id]);
    return res.json({ ok: true, preferred_voice: result.rows[0]?.preferred_voice || null });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
