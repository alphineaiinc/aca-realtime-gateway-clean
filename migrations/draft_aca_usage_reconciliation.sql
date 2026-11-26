BEGIN;
CREATE TABLE public.aca_usage_reconciliation (
 event_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('voice_seconds','ai_tokens')),
 tenant_id integer NOT NULL REFERENCES public.master_tenants(id) ON DELETE RESTRICT,
 quantity bigint NOT NULL CHECK(quantity>0),
 occurred_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,kind)
);
REVOKE ALL ON public.aca_usage_reconciliation FROM PUBLIC;
COMMIT;
