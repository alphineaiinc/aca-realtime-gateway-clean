const pool = require("../../db/pool");

async function getPartnerSummary(partnerId) {
  const { rows } = await pool.query(
    `SELECT 
        COUNT(DISTINCT pr.id) AS referrals,
        COALESCE(SUM(pl.reward_amount),0) AS total_rewards,
        COALESCE(SUM(CASE WHEN pl.event_type='credit' THEN pl.reward_amount ELSE 0 END),0) AS earned,
        COALESCE(SUM(CASE WHEN pl.event_type='debit' THEN pl.reward_amount ELSE 0 END),0) AS redeemed
     FROM partner_referrals pr
     LEFT JOIN partner_rewards_ledger pl ON pl.referral_id=pr.id
     WHERE pr.partner_id=$1`,
    [partnerId]
  );
  return rows[0] || { referrals: 0, total_rewards: 0, earned: 0, redeemed: 0 };
}
module.exports = { getPartnerSummary };
