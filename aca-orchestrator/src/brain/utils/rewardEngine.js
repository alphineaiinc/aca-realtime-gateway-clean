// src/brain/utils/rewardEngine.js
// Ranking + commission logic, with levels and streak bonus.

function levelFor(referrals) {
  if (referrals >= 31) return "Platinum";
  if (referrals >= 16) return "Gold";
  if (referrals >= 6)  return "Silver";
  return "Bronze";
}

function multiplierFor(level) {
  return { Bronze: 1.0, Silver: 1.2, Gold: 1.5, Platinum: 2.0 }[level] || 1.0;
}

function applyStreakBonus(amount, monthsStreak) {
  // +10% if >= 3-month streak
  if (!monthsStreak || monthsStreak < 3) return amount;
  return amount * 1.10;
}

function computeRowMetrics(row, opts = {}) {
  const baseEarned = Number(row.earned || 0);
  const referrals = Number(row.referrals || 0);
  const redeemed  = Number(row.redeemed || 0);
  const pending   = Number(row.pending || 0);
  const monthsStreak = Number(row.streak_months || 0); // optional column in future

  const level = levelFor(referrals);
  const mult  = multiplierFor(level);

  let adjusted = baseEarned * mult;
  adjusted = applyStreakBonus(adjusted, monthsStreak);

  return {
    partner_id: row.partner_id,
    partner_name: row.partner_name || `Partner #${row.partner_id}`,
    country: row.country || "US",
    referrals,
    level,
    earned_adjusted: Number(adjusted.toFixed(2)),
    redeemed,
    pending
  };
}

function rankPartners(rows) {
  const metrics = rows.map(r => computeRowMetrics(r));
  metrics.sort((a, b) => b.earned_adjusted - a.earned_adjusted || b.referrals - a.referrals);
  return metrics.map((m, idx) => ({ rank: idx + 1, ...m }));
}

module.exports = { levelFor, multiplierFor, computeRowMetrics, rankPartners };
