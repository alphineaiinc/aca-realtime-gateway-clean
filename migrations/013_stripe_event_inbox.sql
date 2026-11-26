BEGIN;
CREATE TABLE public.aca_stripe_event_inbox (
 event_id TEXT PRIMARY KEY REFERENCES public.aca_stripe_webhook_events(event_id) ON DELETE RESTRICT,
 payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reconciled_at TIMESTAMPTZ
);
REVOKE ALL ON public.aca_stripe_event_inbox FROM PUBLIC;
COMMIT;
