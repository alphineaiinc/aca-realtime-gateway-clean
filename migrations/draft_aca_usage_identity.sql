-- Draft: existing duplicate evidence must be reconciled before applying.
BEGIN;
CREATE UNIQUE INDEX aca_billable_usage_global_event_kind
 ON public.aca_billable_usage_keys(event_id,kind);
REVOKE ALL ON public.aca_billable_usage_keys FROM PUBLIC;
COMMIT;
