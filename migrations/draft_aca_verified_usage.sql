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
