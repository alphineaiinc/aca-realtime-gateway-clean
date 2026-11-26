BEGIN;
CREATE TABLE public.aca_stripe_customer_identity (
 tenant_id integer NOT NULL REFERENCES public.master_tenants(id) ON DELETE RESTRICT,
 stripe_customer_id text NOT NULL CHECK(stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
 livemode boolean NOT NULL,
 PRIMARY KEY(tenant_id,livemode),
 UNIQUE(stripe_customer_id,livemode),
 UNIQUE(tenant_id,stripe_customer_id,livemode)
);
ALTER TABLE public.aca_stripe_invoice_bindings ADD CONSTRAINT aca_binding_verified_customer FOREIGN KEY(tenant_id,stripe_customer_id,livemode) REFERENCES public.aca_stripe_customer_identity(tenant_id,stripe_customer_id,livemode) ON DELETE RESTRICT;
REVOKE ALL ON public.aca_stripe_customer_identity FROM PUBLIC;
COMMIT;
