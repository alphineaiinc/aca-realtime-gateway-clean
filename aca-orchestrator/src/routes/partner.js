const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { name, email, country } = req.body;
    const referral = "REF" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const jwtSecret = require("crypto").randomBytes(32).toString("hex");

    const result = await pool.query(
      `INSERT INTO partners (name, email, country, referral_code, jwt_secret, accepted_terms)
       VALUES ($1,$2,$3,$4,$5,true) RETURNING id, referral_code`,
      [name, email, country, referral, jwtSecret]
    );

    const token = jwt.sign({ partner_id: result.rows[0].id, role: "partner" }, jwtSecret, { expiresIn: "7d" });
    res.json({ ok: true, token, referral_code: referral });
  } catch (err) {
    console.error("Partner register error:", err);
    res.status(500).json({ ok: false, error: "Registration failed" });
  }
});

module.exports = router;
