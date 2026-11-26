BEGIN;
CREATE TABLE public.aca_invoice_periods(tenant_id INTEGER NOT NULL REFERENCES public.master_tenants(id) ON DELETE RESTRICT,period_start TIMESTAMP NOT NULL,PRIMARY KEY(tenant_id,period_start));
REVOKE ALL ON public.aca_invoice_periods FROM PUBLIC;
COMMIT;
