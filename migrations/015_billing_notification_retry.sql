BEGIN;
ALTER TABLE public.aca_billing_notification_outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0), ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
COMMIT;
