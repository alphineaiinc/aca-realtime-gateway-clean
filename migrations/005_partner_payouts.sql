-- ============================================================
-- 005_partner_payouts.sql
-- Alphine AI — Global Partner Payout Gateway (Story 10.10)
-- ============================================================
-- Purpose:
--   Create table partner_payouts for logging all partner reward
--   disbursements via Stripe Connect or Wise Business.
--   Each payout links back to the partners table (partner_id),
--   and stores provider details, currency, status, timestamps, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_payouts (
  id SERIAL PRIMARY KEY,
  partner_id INTEGER REFERENCES partners(id) ON DELETE CASCADE,
  provider VARCHAR(10) CHECK (provider IN ('stripe', 'wise')),
  payout_ref TEXT,
  currency VARCHAR(5) DEFAULT 'USD',
  amount NUMERIC(10, 2),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

-- Optional index for reporting performance
CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner_id
  ON partner_payouts (partner_id);

-- Optional unique constraint if you ever need to prevent duplicate payout_ref
-- ALTER TABLE partner_payouts ADD CONSTRAINT unique_payout_ref UNIQUE (payout_ref);

-- Audit note:
--   partner_payouts should link with partner_rewards_ledger for traceability
--   Example join: SELECT * FROM partner_rewards_ledger r JOIN partner_payouts p ON r.partner_id = p.partner_id;

-- ============================================================
-- End of migration
-- ============================================================
