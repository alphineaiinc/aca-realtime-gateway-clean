// src/brain/utils/tenantContext.js
// ----------------------------------------------------
// Story 9.X — Tenant Context Helper
// Fetches tenant-level metadata (region, defaults)
// ----------------------------------------------------
const pool = require("../../db/pool");

/**
 * getTenantRegion
 *
 * @param {number|null} tenantId
 * @returns {Promise<string|null>} e.g. "IN", "US", "FR"
 */
async function getTenantRegion(tenantId) {
  if (!tenantId) return null;

  try {
    // NOTE:
    // This assumes a "businesses" table with (tenant_id, country_code).
    // If not present in this environment, we just return null and log once.
    const result = await pool.query(
      `
      SELECT country_code
      FROM businesses
      WHERE tenant_id = $1
      ORDER BY id ASC
      LIMIT 1
      `,
      [tenantId]
    );

    if (result.rowCount === 0) return null;

    const row = result.rows[0];
    return row.country_code || null;
  } catch (err) {
    // Soft-fail: region lookup is optional, do not break the call.
    console.warn(
      `[tenantContext] Region lookup disabled for tenant=${tenantId}: ${err.message}`
    );
    return null;
  }
}

module.exports = {
  getTenantRegion,
};
