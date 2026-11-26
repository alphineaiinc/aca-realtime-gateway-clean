-- Draft: simulated delivery ledger only; no provider dispatch.
CREATE UNIQUE INDEX IF NOT EXISTS idx_aca_outbox_tenant_id ON aca_notification_outbox(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_aca_recipient_tenant_id ON aca_notification_recipients(tenant_id,id);
CREATE TABLE IF NOT EXISTS aca_notification_simulations (
  tenant_id INTEGER NOT NULL,
  outbox_id BIGINT NOT NULL,
  recipient_id BIGINT NOT NULL,
  simulated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id,outbox_id,recipient_id),
  FOREIGN KEY (tenant_id,outbox_id) REFERENCES aca_notification_outbox(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,recipient_id) REFERENCES aca_notification_recipients(tenant_id,id) ON DELETE CASCADE
);
