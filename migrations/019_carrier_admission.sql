CREATE TABLE public.aca_carrier_bindings (
 carrier text NOT NULL, account_id text NOT NULL, called_number text NOT NULL,
 tenant_id integer NOT NULL REFERENCES public.master_tenants(id),
 active boolean NOT NULL DEFAULT false,
 PRIMARY KEY(carrier,account_id,called_number),
 CHECK(carrier ~ '^[a-z][a-z0-9-]{0,31}$'),
 CHECK(account_id ~ '^[A-Za-z0-9._:@+-]{1,128}$'),
 CHECK(called_number ~ '^\+[1-9][0-9]{1,14}$')
);
CREATE TABLE public.aca_carrier_grants (
 call_key text PRIMARY KEY CHECK(call_key ~ '^[a-f0-9]{64}$'),
 carrier text NOT NULL, account_id text NOT NULL, called_number text NOT NULL,
 tenant_id integer NOT NULL REFERENCES public.master_tenants(id),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL, consumed_at timestamptz,
 FOREIGN KEY(carrier,account_id,called_number) REFERENCES public.aca_carrier_bindings(carrier,account_id,called_number)
);
REVOKE ALL ON public.aca_carrier_bindings,public.aca_carrier_grants FROM PUBLIC;
