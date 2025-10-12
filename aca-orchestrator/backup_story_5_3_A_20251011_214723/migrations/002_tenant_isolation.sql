-- ============================================
-- Migration 002_tenant_isolation.sql
-- Story 2.8 — Tenant Isolation
-- ============================================

BEGIN;

-- Each business has its own embedding space
CREATE TABLE IF NOT EXISTS embedding_spaces (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'default',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Optional per-business AI personality configuration
CREATE TABLE IF NOT EXISTS personalities (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    tone TEXT DEFAULT 'friendly',
    language TEXT DEFAULT 'en',
    greeting TEXT DEFAULT 'Hello! How can I help you today?',
    style TEXT DEFAULT 'concise',
    voice TEXT DEFAULT 'elevenlabs_calm',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add embedding_space_id to KB entries
ALTER TABLE kb_entries
ADD COLUMN IF NOT EXISTS embedding_space_id INT REFERENCES embedding_spaces(id);

-- Link KB entries to their space automatically
UPDATE kb_entries
SET embedding_space_id = (
    SELECT id FROM embedding_spaces es WHERE es.business_id = kb_entries.business_id LIMIT 1
)
WHERE embedding_space_id IS NULL;

COMMIT;
