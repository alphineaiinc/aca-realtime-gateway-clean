BEGIN;
CREATE TABLE public.aca_period_pricing (
 tenant_id integer NOT NULL REFERENCES public.master_tenants(id) ON DELETE RESTRICT,
 period_start timestamp NOT NULL CHECK (period_start=date_trunc('month',period_start)),
 minute_rate_cents bigint NOT NULL CHECK (minute_rate_cents>=0),
 token_rate_micros bigint NOT NULL CHECK (token_rate_micros>=0),
 PRIMARY KEY(tenant_id,period_start)
);
CREATE FUNCTION public.aca_reject_price_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_PERIOD_PRICE'; END; $$;
CREATE TRIGGER aca_immutable_period_price BEFORE UPDATE OR DELETE ON public.aca_period_pricing FOR EACH ROW EXECUTE FUNCTION public.aca_reject_price_mutation();
REVOKE ALL ON public.aca_period_pricing FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aca_reject_price_mutation() FROM PUBLIC;
COMMIT;
