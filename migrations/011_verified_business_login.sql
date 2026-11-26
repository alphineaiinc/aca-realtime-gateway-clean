BEGIN;
CREATE TABLE public.aca_business_identities (
 email TEXT PRIMARY KEY CHECK (email=lower(email)),
 tenant_id INTEGER NOT NULL REFERENCES public.master_tenants(id) ON DELETE RESTRICT,
 verified_at TIMESTAMPTZ NOT NULL,
 is_active BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE public.aca_login_challenges (
 token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 email TEXT NOT NULL REFERENCES public.aca_business_identities(email) ON DELETE RESTRICT,
 expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ
);
CREATE INDEX aca_login_expiry_idx ON public.aca_login_challenges(expires_at);
COMMIT;
