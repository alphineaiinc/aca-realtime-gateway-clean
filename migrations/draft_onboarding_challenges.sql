-- Draft-only staging migration: verified onboarding challenge store.
-- Do not apply to production or run automatically.
-- Requires an explicitly approved onboarding provider and rollout plan.
BEGIN;

CREATE TABLE IF NOT EXISTS onboarding_challenges (
  token_hash CHAR(64) PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose = 'tenant-onboarding'),
  email TEXT NOT NULL,
  business_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CONSTRAINT onboarding_challenge_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT onboarding_challenge_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS onboarding_challenges_pending_expiry_idx
  ON onboarding_challenges (expires_at)
  WHERE consumed_at IS NULL;

COMMIT;
