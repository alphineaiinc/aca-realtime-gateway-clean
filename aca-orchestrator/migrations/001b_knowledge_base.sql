-- 001b_knowledge_base.sql
-- Base Knowledge Base schema for ACA Orchestrator

BEGIN;

-- Each knowledge base entry corresponds to an uploaded document chunk
CREATE TABLE IF NOT EXISTS kb_entries (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    source_filename TEXT,
    chunk_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Optional metadata index for faster search per business
CREATE INDEX IF NOT EXISTS idx_kb_entries_business_id
    ON kb_entries(business_id);

COMMIT;
