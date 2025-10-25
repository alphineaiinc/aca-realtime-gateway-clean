-- 001d_master_tenants.sql
-- Master tenant registry for ACA multi-tenant orchestration

BEGIN;

CREATE TABLE IF NOT EXISTS master_tenants (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    contact_number TEXT,
    business_type TEXT,
    region TEXT DEFAULT 'global',
    preferred_lang TEXT DEFAULT 'en-IN',
    jwt_secret TEXT,
    api_key TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_tenants_region
    ON master_tenants(region);

COMMIT;
