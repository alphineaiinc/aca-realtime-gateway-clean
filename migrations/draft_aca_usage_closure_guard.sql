BEGIN;
CREATE FUNCTION public.aca_guard_closed_usage() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE p timestamp;
BEGIN
 IF NEW.event_type IS DISTINCT FROM 'ACA_VERIFIED_USAGE' THEN RETURN NEW; END IF;
 p:=date_trunc('month',NEW.created_at);
 IF NEW.tenant_id IS NULL OR p IS NULL THEN RAISE EXCEPTION 'INVALID_USAGE_PERIOD'; END IF;
 PERFORM pg_advisory_xact_lock(NEW.tenant_id,extract(year FROM p)::integer*12+extract(month FROM p)::integer);
 IF EXISTS(SELECT 1 FROM public.aca_invoice_periods WHERE tenant_id=NEW.tenant_id AND period_start=p) THEN RAISE EXCEPTION 'USAGE_PERIOD_CLOSED'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER aca_guard_closed_usage BEFORE INSERT ON public.analytics_events FOR EACH ROW EXECUTE FUNCTION public.aca_guard_closed_usage();
REVOKE ALL ON FUNCTION public.aca_guard_closed_usage() FROM PUBLIC;
COMMIT;
