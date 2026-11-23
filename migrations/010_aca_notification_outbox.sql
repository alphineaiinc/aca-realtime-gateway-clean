-- ACA-L3 durable notification outbox; DRAFT ONLY, unapplied.
-- No sending credentials, worker, or automatic dispatch are enabled by this migration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_aca_intake_tenant_id ON aca_intake_requests (tenant_id, id);
CREATE TABLE IF NOT EXISTS aca_notification_outbox (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES master_tenants(id) ON DELETE CASCADE,
  intake_request_id BIGINT NOT NULL REFERENCES aca_intake_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('intake.confirmed')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','delivered','failed','dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  last_error_code TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, intake_request_id) REFERENCES aca_intake_requests(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (intake_request_id, event_type)
);
CREATE INDEX IF NOT EXISTS idx_aca_notification_outbox_pending
  ON aca_notification_outbox (next_attempt_at, id)
  WHERE status IN ('pending','failed');
