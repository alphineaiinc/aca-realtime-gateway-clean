-- 001_core_schema.sql
-- Base schema for ACA orchestrator (bootstrap for Neon)

BEGIN;

-- Master list of all tenant businesses
CREATE TABLE IF NOT EXISTS businesses (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Optional table to store AI configuration per business
CREATE TABLE IF NOT EXISTS business_settings (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    setting_key TEXT NOT NULL,
    setting_value TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Initial table for logging basic AI interactions
CREATE TABLE IF NOT EXISTS interaction_logs (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    user_query TEXT,
    ai_response TEXT,
    confidence NUMERIC(4,3),
    created_at TIMESTAMP DEFAULT NOW()
);

COMMIT;
