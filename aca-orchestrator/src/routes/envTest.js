// src/routes/envTest.js
const express = require("express");
const router = express.Router();

router.get("/env", (req, res) => {
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
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
