BEGIN;
CREATE TABLE public.aca_stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing','processed')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  CHECK ((status = 'processing' AND processed_at IS NULL) OR (status = 'processed' AND processed_at IS NOT NULL))
);
CREATE INDEX aca_stripe_webhook_events_received_idx
  ON public.aca_stripe_webhook_events(received_at);
COMMIT;
