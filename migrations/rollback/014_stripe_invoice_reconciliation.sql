BEGIN;
DROP TABLE public.aca_billing_notification_outbox;
DROP TABLE public.aca_stripe_invoice_bindings;
ALTER TABLE public.aca_stripe_event_inbox DROP COLUMN reconciliation_outcome;
COMMIT;
