"use strict";

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

let pool = null;
try {
  pool = require("../db/pool");
} catch (err) {
  try {
    pool = require("../../aca-orchestrator/src/db/pool");
  } catch (innerErr) {
    console.warn("[tenantResolver] DB pool module not found in default locations");
  }
}

function normalizePhoneNumber(value) {
  if (!value) return null;
  const digits = String(value).replace(/[^\d+]/g, "");
  if (!digits) return null;
  return digits;
}

function extractRoutingCandidates(input = {}) {
  const customParameters = input.customParameters || {};

  return {
    tenantId:
      input.tenantId ||
      input.tenant_id ||
      customParameters.tenantId ||
      customParameters.tenant_id ||
      null,

    businessId:
      input.businessId ||
      input.business_id ||
      customParameters.businessId ||
      customParameters.business_id ||
      null,

    calledNumber:
      normalizePhoneNumber(
        input.calledNumber ||
          input.toNumber ||
          input.to ||
          input.twilioNumber ||
          customParameters.calledNumber ||
          customParameters.to ||
          customParameters.phone_number ||
          null
      ),

    callSid: input.callSid || customParameters.callSid || null,

    raw: {
      input,
      customParameters
    }
  };
}

async function lookupTenantByTenantId(tenantId) {
  if (!tenantId || !pool || !pool.query) return null;

  const query = `
    SELECT
      t.id AS tenant_id,
      t.business_id,
      t.cluster_id
    FROM tenants t
    WHERE t.id = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [tenantId]);
  return result.rows[0] || null;
}

async function lookupTenantByBusinessId(businessId) {
  if (!businessId || !pool || !pool.query) return null;

  const query = `
    SELECT
      t.id AS tenant_id,
      t.business_id,
      t.cluster_id
    FROM tenants t
    WHERE t.business_id = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [businessId]);
  return result.rows[0] || null;
}

async function lookupTenantByPhoneNumber(calledNumber) {
  if (!calledNumber || !pool || !pool.query) return null;

  const queryVariants = [
    `
      SELECT
        t.id AS tenant_id,
        t.business_id,
        t.cluster_id
      FROM tenant_phone_numbers p
      INNER JOIN tenants t ON t.id = p.tenant_id
      WHERE p.phone_number = $1
        AND COALESCE(p.is_active, true) = true
      LIMIT 1
    `,
    `
      SELECT
        t.id AS tenant_id,
        t.business_id,
        t.cluster_id
      FROM businesses b
      INNER JOIN tenants t ON t.business_id = b.id
      WHERE b.phone_number = $1
      LIMIT 1
    `,
    `
      SELECT
        t.id AS tenant_id,
        t.business_id,
        t.cluster_id
      FROM tenants t
      WHERE t.phone_number = $1
      LIMIT 1
    `
  ];

  for (const sql of queryVariants) {
    try {
      const result = await pool.query(sql, [calledNumber]);
      if (result.rows[0]) {
        return result.rows[0];
      }
    } catch (err) {
      console.warn("[tenantResolver] phone lookup query skipped:", err.message);
    }
  }

  return null;
}

function buildResolutionResult(resolved, candidates) {
  if (!resolved) {
    console.warn("⚠️ [tenantResolver] fallback to default tenant", {
      candidates
    });

    return {
      ok: true,
      tenantId: 1,
      businessId: candidates.businessId || null,
      clusterId: "generic_service",
      callSid: candidates.callSid || null,
      calledNumber: candidates.calledNumber || null,
      reason: "FALLBACK_DEFAULT"
    };
  }


  return {
    ok: true,
    tenantId: resolved.tenant_id || resolved.tenantId || null,
    businessId: resolved.business_id || resolved.businessId || null,
    clusterId: resolved.cluster_id || resolved.clusterId || null,
    callSid: candidates.callSid || null,
    calledNumber: candidates.calledNumber || null,
    reason: null
  };
}

async function resolveTenantFromVoiceContext(input = {}) {
  const candidates = extractRoutingCandidates(input);

  let resolved = null;

  if (candidates.tenantId) {
    resolved = await lookupTenantByTenantId(candidates.tenantId);
  }

  if (!resolved && candidates.businessId) {
    resolved = await lookupTenantByBusinessId(candidates.businessId);
  }

  if (!resolved && candidates.calledNumber) {
    resolved = await lookupTenantByPhoneNumber(candidates.calledNumber);
  }

  return buildResolutionResult(resolved, candidates);
}

module.exports = {
  normalizePhoneNumber,
  extractRoutingCandidates,
  resolveTenantFromVoiceContext
};