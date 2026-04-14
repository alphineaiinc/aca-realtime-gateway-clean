// src/routes/envTest.js
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

function authenticateAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const token = auth.slice(7).trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const role = String(decoded?.role || "").toLowerCase();
    if (role !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
}

router.get("/env", authenticateAdmin, (req, res) => {
  try {
    // Only show presence, not full values
    res.json({
      ok: true,
      NODE_ENV: process.env.NODE_ENV || "not set",
      DATABASE_URL: !!process.env.DATABASE_URL,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      JWT_SECRET: !!process.env.JWT_SECRET,
      PORT: process.env.PORT || "default",
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

module.exports = router;