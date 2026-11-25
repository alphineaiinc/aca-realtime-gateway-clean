-- Staging-first durable at-most-once reservation for customer request email.
-- Unknown provider outcomes remain reserved: never auto-resend without operator reconciliation.
CREATE TABLE IF NOT EXISTS public.aca_request_email_reservations (
 request_id bigint NOT NULL,
 tenant_id bigint NOT NULL,
 recipient text NOT NULL,
 message_id text NOT NULL,
 state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','sent','uncertain')),
 reserved_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 PRIMARY KEY (request_id,tenant_id),
 UNIQUE (message_id)
);
REVOKE ALL ON public.aca_request_email_reservations FROM PUBLIC;
CREATE INDEX IF NOT EXISTS aca_request_email_reservations_state_idx
 ON public.aca_request_email_reservations(state,reserved_at);
