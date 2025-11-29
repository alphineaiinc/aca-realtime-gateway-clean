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

  // Adjust table/columns if your schema differs.
  // Assumes businesses table has tenant_id + country_code ISO-2.
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
}

module.exports = {
  getTenantRegion,
};
