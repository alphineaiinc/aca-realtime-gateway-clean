BEGIN;
CREATE TABLE public.aca_notification_recipients (
 tenant_id INTEGER PRIMARY KEY REFERENCES public.master_tenants(id) ON DELETE RESTRICT,
 email TEXT NOT NULL,
 verified_at TIMESTAMPTZ,
 is_active BOOLEAN NOT NULL DEFAULT FALSE,
 CHECK (NOT is_active OR verified_at IS NOT NULL)
);
COMMIT;
