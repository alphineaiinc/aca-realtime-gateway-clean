-- 001c_embedding_spaces.sql
-- Table for vector storage and embedding space management

BEGIN;

CREATE TABLE IF NOT EXISTS embedding_spaces (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    dimension INT DEFAULT 1536,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embedding_spaces_business_id
    ON embedding_spaces(business_id);

COMMIT;
