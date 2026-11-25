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

-- Invalidate outstanding grants on revocation or tenant reassignment, including reactivation.
CREATE FUNCTION public.aca_invalidate_carrier_grants() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.active IS DISTINCT FROM NEW.active OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
  UPDATE public.aca_carrier_grants SET expires_at=LEAST(expires_at,clock_timestamp())
   WHERE carrier=OLD.carrier AND account_id=OLD.account_id AND called_number=OLD.called_number AND consumed_at IS NULL;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER aca_carrier_binding_changed AFTER UPDATE OF active,tenant_id ON public.aca_carrier_bindings
 FOR EACH ROW EXECUTE FUNCTION public.aca_invalidate_carrier_grants();
