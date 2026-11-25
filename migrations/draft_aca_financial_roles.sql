BEGIN;
-- Dedicated group roles; no login credentials or membership assignment.
CREATE ROLE aca_financial_meter NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE aca_financial_pricer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE aca_financial_closer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO aca_financial_meter,aca_financial_pricer,aca_financial_closer;
GRANT SELECT,INSERT ON public.aca_billable_usage_keys,public.aca_usage_reconciliation,public.analytics_events TO aca_financial_meter;
GRANT SELECT ON public.aca_invoice_periods TO aca_financial_meter;
GRANT USAGE ON SEQUENCE public.analytics_events_id_seq TO aca_financial_meter;
GRANT SELECT,INSERT ON public.aca_period_pricing TO aca_financial_pricer;
GRANT SELECT ON public.analytics_events,public.aca_period_pricing TO aca_financial_closer;
GRANT SELECT,INSERT ON public.aca_invoice_periods,public.billing_invoices TO aca_financial_closer;
GRANT USAGE ON SEQUENCE public.billing_invoices_id_seq TO aca_financial_closer;
COMMIT;
