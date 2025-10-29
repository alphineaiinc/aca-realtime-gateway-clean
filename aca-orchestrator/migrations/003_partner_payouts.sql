-- 003_partner_payouts.sql
-- Creates payout ledger + (optional) aggregation view for leaderboard.

CREATE TABLE IF NOT EXISTS partner_payouts (
    id SERIAL PRIMARY KEY,
    partner_id INT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|approved|rejected|paid
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL,
    approved_by INT NULL,
    payout_method_enc BYTEA NULL,     -- AES-GCM encrypted blob
    payout_reference_enc BYTEA NULL,  -- AES-GCM encrypted blob (transaction id from Stripe/Wise/etc.)
    notes TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner_id ON partner_payouts(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_status ON partner_payouts(status);

-- OPTIONAL helper view (adjust mapping as needed to your existing partner_rewards schema)
-- This view assumes a table 'partner_rewards' with at least partner_id, partner_name, country, referrals, earned, redeemed, pending.
-- If your columns differ, edit the SELECT below accordingly.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='vw_partner_leaderboard') THEN
        EXECUTE $sql$
            CREATE VIEW vw_partner_leaderboard AS
            SELECT
                pr.partner_id,
                COALESCE(pr.partner_name, CONCAT('Partner #', pr.partner_id)) AS partner_name,
                COALESCE(pr.country, 'US') AS country,
                COALESCE(pr.referrals, 0) AS referrals,
                COALESCE(pr.earned, 0)::NUMERIC(12,2) AS earned,
                COALESCE(pr.redeemed, 0)::NUMERIC(12,2) AS redeemed,
                COALESCE(pr.pending, 0)::NUMERIC(12,2) AS pending
            FROM partner_rewards pr;
        $sql$;
    END IF;
END$$;

-- Minimal seed to avoid empty dashboards (safe no-op if data exists)
-- INSERT INTO partner_rewards(partner_id, partner_name, country, referrals, earned, redeemed, pending)
-- VALUES (1, 'Jean Dupont', 'FR', 24, 480, 300, 180)
-- ON CONFLICT DO NOTHING;
