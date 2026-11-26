BEGIN;
CREATE FUNCTION public.aca_protect_verified_usage() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.event_type='ACA_VERIFIED_USAGE' THEN RAISE EXCEPTION 'IMMUTABLE_VERIFIED_USAGE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.event_type='ACA_VERIFIED_USAGE' THEN RAISE EXCEPTION 'IMMUTABLE_VERIFIED_USAGE'; END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END; $$;
CREATE TRIGGER aca_protect_verified_usage BEFORE UPDATE OR DELETE ON public.analytics_events FOR EACH ROW EXECUTE FUNCTION public.aca_protect_verified_usage();
CREATE FUNCTION public.aca_protect_usage_key() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_USAGE_KEY'; END; $$;
CREATE TRIGGER aca_protect_usage_key BEFORE UPDATE OR DELETE ON public.aca_billable_usage_keys FOR EACH ROW EXECUTE FUNCTION public.aca_protect_usage_key();
REVOKE ALL ON FUNCTION public.aca_protect_verified_usage() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aca_protect_usage_key() FROM PUBLIC;
COMMIT;
