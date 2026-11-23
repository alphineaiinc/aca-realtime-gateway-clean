// src/routes/tenant.js
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../db/pool");

// ---------------------------------------------------------------------------
// Utility: build safe insert for master_tenants based on actual columns
// ---------------------------------------------------------------------------
async function insertTenantDynamic(client, payload) {
  const name = String(payload?.business_name || "").trim();
  if (!name) {
    const error = new Error("business_name_required");
    error.statusCode = 400;
    throw error;
  }
  const { rows } = await client.query(
    `INSERT INTO master_tenants (business_name, preferred_lang, region)
     VALUES ($1, $2, $3) RETURNING id`,
    [name, payload?.preferred_lang || "en-US", payload?.region || "global"]
  );
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// POST /tenant/provision (secured via header API key)
// ---------------------------------------------------------------------------
router.post("/provision", async (req, res) => {
  const key = req.headers["x-api-key"] || "";

  if (!process.env.PROVISION_API_KEY || key !== process.env.PROVISION_API_KEY) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const businessName = req.body?.business_name || null;

  try {
    // Use one dedicated connection for the entire transaction.
    const client = await pool.connect();
    let tenantId;
    try {
      await client.query("BEGIN");
      tenantId = await insertTenantDynamic(client, req.body);
      // The deployed schema uses master_tenants as the canonical business row.
      // No businesses or embedding_spaces table is required for provisioning.
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return res.json({
      ok: true,
      tenant_id: tenantId,
      message: "Tenant provisioned successfully",
    });
  } catch (err) {
    console.error("Provision error:", err);
    return res.status(err.statusCode || 500).json({
      ok: false,
      error: err.statusCode === 400 ? "business_name_required" : "internal_error",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /tenant/login
// ---------------------------------------------------------------------------
// Tenant ID alone is not proof of ownership. Until an independently
// authenticated identity flow is integrated, do not mint tenant JWTs.
router.post("/login", (_req, res) => {
  return res.status(403).json({ ok: false, error: "verified_login_required" });
});

// ---------------------------------------------------------------------------
// GET /tenant/profile (JWT required)
// ---------------------------------------------------------------------------
router.get("/profile", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";

    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const token = auth.slice(7).trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const tenantId = decoded.tenant_id;

    const { rows } = await pool.query(
      `SELECT id AS tenant_id, business_name, preferred_lang, region
       FROM master_tenants WHERE id=$1`,
      [tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "tenant_not_found" });
    }

    return res.json({ ok: true, profile: rows[0] });
  } catch (err) {
    console.error("Profile error:", err);
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
});

module.exports = router;