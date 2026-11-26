-- Draft only. No recipients seeded and no delivery enabled.
CREATE TABLE IF NOT EXISTS aca_notification_recipients (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES master_tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  destination TEXT NOT NULL CHECK (length(destination) BETWEEN 3 AND 254),
  verified_at TIMESTAMPTZ,
  consent_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT enabled OR (verified_at IS NOT NULL AND consent_at IS NOT NULL AND revoked_at IS NULL)),
  UNIQUE (tenant_id, channel, destination)
);
CREATE INDEX IF NOT EXISTS idx_aca_notification_recipients_active
  ON aca_notification_recipients (tenant_id, id)
  WHERE enabled AND revoked_at IS NULL;
