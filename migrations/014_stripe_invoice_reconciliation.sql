BEGIN;
ALTER TABLE public.aca_stripe_event_inbox ADD COLUMN reconciliation_outcome TEXT;
CREATE TABLE public.aca_stripe_invoice_bindings (
 stripe_invoice_id TEXT PRIMARY KEY,
 stripe_customer_id TEXT NOT NULL,
 invoice_id INTEGER NOT NULL UNIQUE REFERENCES public.billing_invoices(id) ON DELETE RESTRICT,
 tenant_id INTEGER NOT NULL REFERENCES public.master_tenants(id) ON DELETE RESTRICT,
 amount_cents BIGINT NOT NULL CHECK(amount_cents>0),
 livemode BOOLEAN NOT NULL
);
CREATE TABLE public.aca_billing_notification_outbox (
 event_id TEXT PRIMARY KEY REFERENCES public.aca_stripe_event_inbox(event_id) ON DELETE RESTRICT,
 invoice_id INTEGER NOT NULL REFERENCES public.billing_invoices(id) ON DELETE RESTRICT,
 tenant_id INTEGER NOT NULL REFERENCES public.master_tenants(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 delivered_at TIMESTAMPTZ
);
REVOKE ALL ON public.aca_stripe_invoice_bindings,public.aca_billing_notification_outbox FROM PUBLIC;
COMMIT;
