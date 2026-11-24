-- Draft only. Apply only after role and schema review.
CREATE TABLE aca_billing_prices (
 version text NOT NULL, unit text NOT NULL CHECK(unit IN ('call_second','ai_token')),
 micro_usd_per_unit bigint NOT NULL CHECK(micro_usd_per_unit>=0),
 PRIMARY KEY(version,unit)
);
CREATE TABLE aca_verified_usage (
 source text NOT NULL, source_id text NOT NULL, unit text NOT NULL,
 tenant_id integer NOT NULL REFERENCES master_tenants(id),
 quantity bigint NOT NULL CHECK(quantity>0),
 price_version text NOT NULL, occurred_at timestamptz NOT NULL,
 PRIMARY KEY(source,source_id,unit),
 FOREIGN KEY(price_version,unit) REFERENCES aca_billing_prices(version,unit)
);
REVOKE ALL ON aca_billing_prices,aca_verified_usage FROM PUBLIC;

CREATE TABLE aca_billing_closures (
 tenant_id integer NOT NULL REFERENCES master_tenants(id),
 month_start date NOT NULL CHECK(EXTRACT(DAY FROM month_start)=1),
 invoice_id integer UNIQUE REFERENCES billing_invoices(id),
 amount_cents bigint NOT NULL CHECK(amount_cents>=0),
 PRIMARY KEY(tenant_id,month_start)
);
REVOKE ALL ON aca_billing_closures FROM PUBLIC;
CREATE FUNCTION aca_billing_price_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Price versions are immutable'; END $$;
CREATE TRIGGER aca_billing_price_immutable BEFORE UPDATE OR DELETE ON aca_billing_prices
FOR EACH ROW EXECUTE FUNCTION aca_billing_price_immutable();
CREATE FUNCTION aca_usage_open_period() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m date;
BEGIN
 m:=date_trunc('month',NEW.occurred_at AT TIME ZONE 'UTC')::date;
 PERFORM pg_advisory_xact_lock(NEW.tenant_id, (EXTRACT(YEAR FROM m)*12+EXTRACT(MONTH FROM m))::integer);
 IF EXISTS(SELECT 1 FROM aca_billing_closures WHERE tenant_id=NEW.tenant_id AND month_start=m)
 THEN RAISE EXCEPTION 'Billing period closed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aca_usage_open_period BEFORE INSERT ON aca_verified_usage FOR EACH ROW EXECUTE FUNCTION aca_usage_open_period();
CREATE TRIGGER aca_usage_immutable BEFORE UPDATE OR DELETE ON aca_verified_usage FOR EACH ROW EXECUTE FUNCTION aca_billing_price_immutable();
