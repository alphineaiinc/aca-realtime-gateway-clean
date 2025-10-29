-- 003_add_voice_profiles.sql
CREATE TABLE IF NOT EXISTS voice_profiles (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES master_tenants(id) ON DELETE CASCADE,
  profile_name TEXT DEFAULT 'default',
  voice_id TEXT,
  language_code TEXT,
  gender TEXT,
  pitch NUMERIC DEFAULT 1.0,
  speed NUMERIC DEFAULT 1.0,
  tone TEXT DEFAULT 'neutral',
  accent TEXT DEFAULT 'default',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_profiles_tenant ON voice_profiles(tenant_id);
