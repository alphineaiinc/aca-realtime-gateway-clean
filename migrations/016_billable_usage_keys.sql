BEGIN;
CREATE TABLE public.aca_billable_usage_keys (
 tenant_id INTEGER NOT NULL REFERENCES public.master_tenants(id) ON DELETE RESTRICT,
 event_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('voice_seconds','ai_tokens')),
 PRIMARY KEY(tenant_id,event_id,kind)
);
REVOKE ALL ON public.aca_billable_usage_keys FROM PUBLIC;
COMMIT;
