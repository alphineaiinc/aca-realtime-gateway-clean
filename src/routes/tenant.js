// src/routes/tenant.js
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../db/pool");
const { createPostgresRateLimiter } = require("../middleware/postgresRateLimit");
const provisionLimit = createPostgresRateLimiter({pool,scope:"tenant-provision",max:10,publicGlobal:true});
const profileLimit = createPostgresRateLimiter({pool,scope:"tenant-profile",max:60});

// ---------------------------------------------------------------------------
// Utility: build safe insert for master_tenants based on actual columns
// ---------------------------------------------------------------------------
async function insertTenantDynamic(client, payload) {
  const { rows: cols } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='master_tenants'
  `);

  const allowed = new Set(cols.map(c => c.column_name));

  const candidateFields = {
    email:
      payload.email ||
      payload.contact_email ||
      `tenant_${Date.now()}@autogen.local`,
    business_type: payload.business_type || "unknown",
    preferred_lang: payload.preferred_lang || "en-US",
    contact_email: payload.contact_email || null,
    region: payload.region || "global",
    phone: payload.phone || null,
  };

  const fields = [];
  const values = [];
  const params = [];
  let i = 1;

  for (const [k, v] of Object.entries(candidateFields)) {
    if (allowed.has(k) && v !== null && v !== undefined) {
      fields.push(k);
      values.push(v);
      params.push(`$${i++}`);
    }
  }

  if (fields.length === 0) {
    const { rows } = await client.query(
      `INSERT INTO master_tenants DEFAULT VALUES RETURNING id`
    );
    return rows[0].id;
  }

  const sql = `
    INSERT INTO master_tenants (${fields.join(", ")})
    VALUES (${params.join(", ")})
    RETURNING id
  `;

  const { rows } = await client.query(sql, values);
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
function authorizeProvision(req,res,next) {
  const key = req.headers["x-api-key"] || "";

  if (!process.env.PROVISION_API_KEY || key !== process.env.PROVISION_API_KEY) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  return next();
}
router.post("/provision", authorizeProvision, provisionLimit, async (req,res) => {
  const businessName = req.body?.business_name || null;

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const tenantId = await insertTenantDynamic(client, req.body || {});
    await insertBusiness(client, tenantId, businessName);
    await ensureDefaultEmbeddingSpace(client, tenantId);

    await client.query("COMMIT");

    return res.json({
      ok: true,
      tenant_id: tenantId,
      message: "Tenant provisioned successfully",
    });
  } catch (err) {
    console.error("Tenant provisioning failed");
    if (client) await client.query("ROLLBACK").catch(() => {});

    return res.status(500).json({
      ok: false,
      error: "internal_error",
    });
  } finally {
    if (client) client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /tenant/login
// ---------------------------------------------------------------------------
router.post("/login", (req, res) => {
  return res.status(403).json({ ok: false, error: "Verified login required" });
});

// ---------------------------------------------------------------------------
// GET /tenant/profile (JWT required)
// ---------------------------------------------------------------------------
function authorizeProfile(req,res,next) {
  try {
    const auth = req.headers.authorization || "";

    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const token = auth.slice(7).trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.tenant_id || decoded.role === "demo" || decoded.demo === true) return res.status(401).json({ok:false,error:"unauthorized"});
    req.tenant_id = decoded.tenant_id;
    return next();
  } catch {
    return res.status(401).json({ok:false,error:"unauthorized"});
  }
}
router.get("/profile", authorizeProfile, profileLimit, async (req,res) => {
  try {
    const tenantId = req.tenant_id;
    const { rows } = await pool.query(
      `SELECT t.id AS tenant_id,
              t.email,
              t.preferred_lang,
              t.business_type,
              b.id AS business_id
       FROM master_tenants t
       LEFT JOIN businesses b ON t.id=b.id
       WHERE t.id=$1`,
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