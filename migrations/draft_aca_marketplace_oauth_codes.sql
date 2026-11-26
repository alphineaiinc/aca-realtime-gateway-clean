BEGIN;
CREATE TABLE public.aca_marketplace_oauth_codes (
 code_hash TEXT PRIMARY KEY CHECK (code_hash ~ '^[0-9a-f]{64}$'),
 email TEXT NOT NULL REFERENCES public.aca_business_identities(email) ON DELETE CASCADE,
 tenant_id INTEGER NOT NULL REFERENCES public.master_tenants(id) ON DELETE CASCADE,
 client_id TEXT NOT NULL,
 redirect_uri TEXT NOT NULL,
 resource TEXT NOT NULL,
 challenge TEXT NOT NULL CHECK (challenge ~ '^[A-Za-z0-9_-]{43}$'),
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX aca_marketplace_oauth_codes_expiry_idx ON public.aca_marketplace_oauth_codes(expires_at);
REVOKE ALL ON public.aca_marketplace_oauth_codes FROM PUBLIC;
-- No runtime grants or role assignments here. Approved issuer role needs INSERT,
-- SELECT and DELETE on this table and SELECT on identity membership fields.
-- Resource-server role does not need code table access.
COMMIT;
