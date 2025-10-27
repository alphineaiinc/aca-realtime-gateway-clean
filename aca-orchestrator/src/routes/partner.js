// src/routes/partner.js
// 🪙 Story 10.2.1 — Global Referral Expansion by Language Region
// -----------------------------------------------------------------------------
// This route handles partner registration and automatically validates
// referral eligibility based on global language registry + regional policies.
// -----------------------------------------------------------------------------

const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const pool = require("../db/pool");
const router = express.Router();

// -----------------------------------------------------------------------------
// 🔐 Load partner policy + language registry dynamically
// -----------------------------------------------------------------------------
const policyPath = path.resolve(__dirname, "../../config/partnerPolicy.json");
const langRegistryPath = path.resolve(__dirname, "../../config/languageRegistry.json");

let policy = {};
let languageRegistry = {};

try {
  policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
} catch (err) {
  console.warn("⚠️ partnerPolicy.json not found or invalid:", err.message);
  policy = { restricted_countries: ["CN", "RU", "IR"], global_mode: true };
}

try {
  const raw = JSON.parse(fs.readFileSync(langRegistryPath, "utf8"));
  languageRegistry = raw.languages || {};
} catch (err) {
  console.warn("⚠️ languageRegistry.json not found or invalid:", err.message);
  languageRegistry = {};
}

// Utility → Extract country codes from language registry (e.g., "ta-IN" → "IN")
function getAllowedCountriesFromLanguages() {
  const codes = new Set();
  for (const key of Object.keys(languageRegistry)) {
    const parts = key.split("-");
    if (parts.length === 2) codes.add(parts[1]);
  }
  return Array.from(codes);
}

// -----------------------------------------------------------------------------
// 🧩 POST /partner/register — Register new partner
// -----------------------------------------------------------------------------
router.post("/register", async (req, res) => {
  try {
    const { name, email, country } = req.body;

    if (!name || !email || !country) {
      return res.status(400).json({ ok: false, error: "Missing name, email, or country." });
    }

    const normalizedCountry = country.toUpperCase();
    const restricted = policy.restricted_countries || [];
    const autoAllowed = policy.auto_allow_language_regions ?? true;
    const allowedLangCountries = getAllowedCountriesFromLanguages();

    let eligible = true;
    if (policy.global_mode) {
      // Global mode: block only restricted
      if (restricted.includes(normalizedCountry)) eligible = false;
    } else {
      // Local mode: allow if in policy or language list
      eligible =
        (policy.allowed_countries && policy.allowed_countries.includes(normalizedCountry)) ||
        (autoAllowed && allowedLangCountries.includes(normalizedCountry));
    }

    if (!eligible) {
      return res
        .status(403)
        .json({ ok: false, error: `Referral not available in ${normalizedCountry} region yet.` });
    }

    const referral = "REF" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const jwtSecret = crypto.randomBytes(32).toString("hex");

    const result = await pool.query(
      `INSERT INTO partners (name, email, country, referral_code, jwt_secret, accepted_terms)
       VALUES ($1,$2,$3,$4,$5,true)
       RETURNING id, referral_code`,
      [name, email, normalizedCountry, referral, jwtSecret]
    );

    const token = jwt.sign(
      { partner_id: result.rows[0].id, role: "partner" },
      jwtSecret,
      { expiresIn: "7d" }
    );

    res.json({
      ok: true,
      message: "Partner registered successfully",
      referral_code: referral,
      token,
      region: normalizedCountry,
      global_mode: policy.global_mode,
    });
  } catch (err) {
    console.error("❌ Partner register error:", err);
    res.status(500).json({ ok: false, error: "Registration failed" });
  }
});

// -----------------------------------------------------------------------------
// 🧩 GET /partner/policies — (Optional diagnostic route)
// -----------------------------------------------------------------------------
router.get("/policies", (req, res) => {
  res.json({
    ok: true,
    global_mode: policy.global_mode,
    restricted_countries: policy.restricted_countries,
    supported_languages: Object.keys(languageRegistry).length,
  });
});

// -----------------------------------------------------------------------------
module.exports = router;
