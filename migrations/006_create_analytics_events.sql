-- 006_create_analytics_events.sql
CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT,
  partner_id INT,
  event_type VARCHAR(50) NOT NULL,   -- GPT, TTS, STT, CALL, REFERRAL, etc.
  quantity NUMERIC(12,3) DEFAULT 0,
  unit VARCHAR(20) DEFAULT '',
  cost NUMERIC(10,4) DEFAULT 0,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
