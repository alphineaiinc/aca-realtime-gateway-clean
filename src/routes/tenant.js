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
// Utility: create or update business row
// ---------------------------------------------------------------------------
async function insertBusiness(client, tenantId, businessName) {
  const { rows: cols } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='businesses'
  `);

  const hasName = cols.some(c => c.column_name === "name");

  if (hasName) {
    await client.query(
      `INSERT INTO businesses (id, name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [tenantId, businessName || `Tenant ${tenantId}`]
    );
  } else {
    await client.query(
      `INSERT INTO businesses (id)
       VALUES ($1)
       ON CONFLICT (id) DO NOTHING`,
      [tenantId]
    );
  }
}

// ---------------------------------------------------------------------------
// Utility: ensure embedding space
// ---------------------------------------------------------------------------
async function ensureDefaultEmbeddingSpace(client, tenantId) {
  const { rows: tcols } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='embedding_spaces'
  `);

  if (tcols.length === 0) return;

  const hasBusinessId = tcols.some(c => c.column_name === "business_id");
  const hasName = tcols.some(c => c.column_name === "name");

  if (!hasBusinessId) return;

  const { rows: existing } = await client.query(
    hasName
      ? `SELECT id FROM embedding_spaces WHERE business_id=$1 AND name='default' LIMIT 1`
      : `SELECT id FROM embedding_spaces WHERE business_id=$1 LIMIT 1`,
    [tenantId]
  );

  if (existing.length > 0) return existing[0].id;

  if (hasName) {
    const { rows } = await client.query(
      `INSERT INTO embedding_spaces (business_id, name)
       VALUES ($1, 'default')
       RETURNING id`,
      [tenantId]
    );
    return rows[0].id;
  } else {
    const { rows } = await client.query(
      `INSERT INTO embedding_spaces (business_id)
       VALUES ($1)
       RETURNING id`,
      [tenantId]
    );
    return rows[0].id;
  }
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
router.post("/login", async (req, res) => {
  try {
    const tenantId = Number(req.body?.tenant_id);

    if (!tenantId) {
      return res.status(400).json({ ok: false, error: "tenant_id required" });
    }

    const { rows } = await pool.query(
      `SELECT id FROM master_tenants WHERE id=$1`,
      [tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "tenant_not_found" });
    }

    const token = jwt.sign(
      { tenant_id: tenantId },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({ ok: true, token });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
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