CREATE TABLE IF NOT EXISTS partner_legal_acceptance (
  id SERIAL PRIMARY KEY,
  partner_id INTEGER REFERENCES partners(id) ON DELETE CASCADE,
  version VARCHAR(20) NOT NULL,
  accepted_at TIMESTAMP DEFAULT NOW(),
  ip_address TEXT,
  signature_token TEXT UNIQUE
);
