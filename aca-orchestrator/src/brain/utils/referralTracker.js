const pool = require("../../db/pool");

async function logReferral(refCode, tenantId) {
  try {
    const { rows } = await pool.query("SELECT id FROM partners WHERE referral_code=$1", [refCode]);
    if (!rows.length) return;
    const partnerId = rows[0].id;
    await pool.query(
      "INSERT INTO partner_referrals (partner_id, tenant_id) VALUES ($1,$2)",
      [partnerId, tenantId]
    );
    console.log(`Referral logged: ${refCode} → Tenant ${tenantId}`);
  } catch (err) {
    console.error("Referral logging error:", err);
  }
}
module.exports = { logReferral };
