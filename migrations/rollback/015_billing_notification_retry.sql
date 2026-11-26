BEGIN;
ALTER TABLE public.aca_billing_notification_outbox DROP COLUMN attempts,DROP COLUMN next_attempt_at;
COMMIT;
