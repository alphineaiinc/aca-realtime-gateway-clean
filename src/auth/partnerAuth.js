// src/auth/partnerAuth.js
// 🧩 Story 10.3 — Secure Partner Auth Middleware

const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

async function partnerAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
    if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

    // Decode unverified payload to get partner_id
    let decoded;
    try {
      decoded = jwt.decode(token);
    } catch (err) {
      console.error("❌ Invalid token format:", err.message);
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    if (!decoded?.partner_id) {
      console.warn("⚠️ Token missing partner_id:", decoded);
      return res.status(401).json({ ok: false, error: "Invalid token payload" });
    }

    // Retrieve JWT secret from database
    const { rows } = await pool.query("SELECT jwt_secret FROM partners WHERE id=$1", [decoded.partner_id]);
    if (!rows.length) {
      console.warn("⚠️ No partner found for id:", decoded.partner_id);
      return res.status(401).json({ ok: false, error: "Partner not found" });
    }

    const partnerSecret = rows[0].jwt_secret;
    try {
      const verified = jwt.verify(token, partnerSecret);
      req.partner_id = verified.partner_id;
      next();
    } catch (verifyErr) {
      console.error("❌ Token verification failed:", verifyErr.message);
      return res.status(401).json({ ok: false, error: "Token verification failed or expired" });
    }
  } catch (err) {
    console.error("Partner auth middleware error:", err.message);
    res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

module.exports = { partnerAuth };
