// src/routes/tenant.js
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../db/pool");

// Util: build safe insert for master_tenants based on actual columns
async function insertTenantDynamic(client, payload) {
  // discover columns in master_tenants
  const { rows: cols } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='master_tenants'
  `);
  const allowed = new Set(cols.map(c => c.column_name));

  // prefer these if present in table; ignore silently if column doesn’t exist
  const candidateFields = {
    business_type: payload.business_type || "unknown",
    preferred_lang: payload.preferred_lang || "en-US",
    contact_email: payload.contact_email || null,
    region: payload.region || null,
    phone: payload.phone || null
  };

  const fields = [];
  const values = [];
  const params = [];
  let i = 1;
  for (const [k, v] of Object.entries(candidateFields)) {
    if (allowed.has(k)) {
      fields.push(k);
      values.push(v);
      params.push(`$${i++}`);
    }
  }

  const sql = `
    INSERT INTO master_tenants (${fields.join(", ")})
    VALUES (${params.join(", ")})
    RETURNING id
  `;
  const { rows } = await client.query(sql, values);
  return rows[0].id;
}

// Util: create/ensure business row with same id (1:1 mapping used in your DB)
async function insertBusiness(client, tenantId, businessName) {
  // detect businesses columns
  const { rows: cols } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='businesses'
  `);
  const hasName = cols.some(c => c.column_name === "name");

  // upsert pattern to avoid duplicates on retries
  if (hasName) {
    await client.query(
      `INSERT INTO businesses (id, name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [tenantId, businessName || `Tenant ${tenantId}`]
    );
  } else {
    // fall back to id-only insert if schema is ultra-minimal
    await client.query(
      `INSERT INTO businesses (id)
       VALUES ($1)
       ON CONFLICT (id) DO NOTHING`,
      [tenantId]
    );
  }
}

// Util: ensure a default embedding space exists (if table/columns exist)
async function ensureDefaultEmbeddingSpace(client, tenantId) {
  // discover table/columns
  const { rows: tcols } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='embedding_spaces'
  `);
  if (tcols.length === 0) return; // table not present; skip silently

  const hasBusinessId = tcols.some(c => c.column_name === "business_id");
  const hasName = tcols.some(c => c.column_name === "name");

  if (!hasBusinessId) return;

  // find existing
  const { rows: existing } = await client.query(
    hasName
      ? `SELECT id FROM embedding_spaces WHERE business_id=$1 AND name='default' LIMIT 1`
      : `SELECT id FROM embedding_spaces WHERE business_id=$1 LIMIT 1`,
    [tenantId]
  );
  if (existing.length > 0) return existing[0].id;

  // create default
  if (hasName) {
    const { rows } = await client.query(
      `INSERT INTO embedding_spaces (business_id, name) VALUES ($1, 'default') RETURNING id`,
      [tenantId]
    );
    return rows[0].id;
  } else {
    const { rows } = await client.query(
      `INSERT INTO embedding_spaces (business_id) VALUES ($1) RETURNING id`,
      [tenantId]
    );
    return rows[0].id;
  }
}

// POST /tenant/provision  (secured by PROVISION_API_KEY)
// body: { api_key, business_name?, business_type, preferred_lang, contact_email?, region?, phone? }
router.post("/provision", async (req, res) => {
  try {
    const key = req.body?.api_key || "";
    if (!process.env.PROVISION_API_KEY || key !== process.env.PROVISION_API_KEY) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const businessName = req.body?.business_name || null;

    await pool.query("BEGIN");
    const client = pool;

    const tenantId = await insertTenantDynamic(client, req.body);
    await insertBusiness(client, tenantId, businessName);
    await ensureDefaultEmbeddingSpace(client, tenantId);

    await pool.query("COMMIT");
    return res.json({ ok: true, tenant_id: tenantId, message: "Tenant provisioned successfully" });
  return res.status(500).json({ ok: false, error: err.message || "Provision failed" });

});

// POST /tenant/login  -> returns JWT {tenant_id}
// body: { tenant_id }
router.post("/login", async (req, res) => {
  try {
    const tenantId = Number(req.body?.tenant_id);
    if (!tenantId) return res.status(400).json({ ok: false, error: "tenant_id required" });

    const { rows } = await pool.query(`SELECT id FROM master_tenants WHERE id=$1`, [tenantId]);
    if (rows.length === 0) return res.status(404).json({ ok: false, error: "Tenant not found" });

    const token = jwt.sign({ tenant_id: tenantId }, process.env.JWT_SECRET, { expiresIn: "12h" });
    return res.json({ ok: true, token });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ ok: false, error: "Login failed" });
  }
});

// GET /tenant/profile  (JWT)
// header: Authorization: Bearer <token>
router.get("/profile", async (req, res) => {
  try {
    const auth = (req.headers.authorization || "").replace("Bearer ", "");
    const decoded = jwt.verify(auth, process.env.JWT_SECRET);
    const tenantId = decoded.tenant_id;

    const { rows } = await pool.query(
      `SELECT t.id AS tenant_id, t.preferred_lang, t.business_type,
              b.id AS business_id
       FROM master_tenants t
       LEFT JOIN businesses b ON t.id=b.id
       WHERE t.id=$1`,
      [tenantId]
    );
    return res.json({ ok: true, ...rows[0] });
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
});

module.exports = router;
