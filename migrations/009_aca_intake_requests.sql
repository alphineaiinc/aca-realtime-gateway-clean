-- ACA-L3: durable confirmed caller intake. DRAFT ONLY: not applied to any database.
-- Keep notification delivery separate; requests must persist before a delivery attempt.
CREATE TABLE IF NOT EXISTS aca_intake_requests (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES master_tenants(id) ON DELETE CASCADE,
  call_sid TEXT NOT NULL,
  cluster_id TEXT NOT NULL,
  intent TEXT,
  slots JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, call_sid)
);
CREATE INDEX IF NOT EXISTS idx_aca_intake_requests_tenant_created
  ON aca_intake_requests (tenant_id, created_at DESC);
