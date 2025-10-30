-- 003_partner_messages.sql
-- Alphine AI - Partner Communication Hub (Story 10.8)
-- Creates message table linked to partners

CREATE TABLE IF NOT EXISTS partner_messages (
  id SERIAL PRIMARY KEY,
  partner_id INTEGER REFERENCES partners(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  delivery_type VARCHAR(10) CHECK (delivery_type IN ('email','inapp')),
  status VARCHAR(10) DEFAULT 'queued',
  created_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP
);
