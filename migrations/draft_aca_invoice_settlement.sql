-- Draft only; do not apply to production. Test and live ledgers must be isolated.
CREATE TABLE aca_stripe_invoice_mapping (
 stripe_invoice_id text PRIMARY KEY,
 stripe_customer_id text NOT NULL,
 invoice_id bigint NOT NULL UNIQUE,
 tenant_id bigint NOT NULL,
 amount_cents bigint NOT NULL CHECK (amount_cents > 0),
 currency text NOT NULL CHECK (currency = 'usd'),
 live_mode boolean NOT NULL,
 settled_event_id text UNIQUE,
 settled_at timestamptz,
 CHECK ((settled_event_id IS NULL) = (settled_at IS NULL))
);
REVOKE ALL ON aca_stripe_invoice_mapping FROM PUBLIC;
