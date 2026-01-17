-- 00X_extend_tenant_voice_profile.sql
-- Story 9.X — Ensure tenant_voice_profile has all needed columns

DO $$
BEGIN
  -- Create table if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'tenant_voice_profile'
  ) THEN
    CREATE TABLE tenant_voice_profile (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      lang_code TEXT NOT NULL,
      voice_id TEXT,
      tone_preset TEXT DEFAULT 'friendly',
      stability NUMERIC(4,3) DEFAULT 0.400,
      similarity_boost NUMERIC(4,3) DEFAULT 0.800,
      speaking_rate NUMERIC(4,3) DEFAULT 1.000,
      region_code TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CONSTRAINT tenant_voice_profile_unique UNIQUE (tenant_id, lang_code)
    );
  END IF;

  -- If table exists, add missing columns safely
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_voice_profile' AND column_name = 'tone_preset'
  ) THEN
    ALTER TABLE tenant_voice_profile
      ADD COLUMN tone_preset TEXT DEFAULT 'friendly';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_voice_profile' AND column_name = 'stability'
  ) THEN
    ALTER TABLE tenant_voice_profile
      ADD COLUMN stability NUMERIC(4,3) DEFAULT 0.400;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_voice_profile' AND column_name = 'similarity_boost'
  ) THEN
    ALTER TABLE tenant_voice_profile
      ADD COLUMN similarity_boost NUMERIC(4,3) DEFAULT 0.800;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_voice_profile' AND column_name = 'speaking_rate'
  ) THEN
    ALTER TABLE tenant_voice_profile
      ADD COLUMN speaking_rate NUMERIC(4,3) DEFAULT 1.000;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_voice_profile' AND column_name = 'region_code'
  ) THEN
    ALTER TABLE tenant_voice_profile
      ADD COLUMN region_code TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_voice_profile' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE tenant_voice_profile
      ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;

  -- Ensure unique constraint on (tenant_id, lang_code)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'tenant_voice_profile'
      AND constraint_name = 'tenant_voice_profile_unique'
  ) THEN
    ALTER TABLE tenant_voice_profile
      ADD CONSTRAINT tenant_voice_profile_unique
      UNIQUE (tenant_id, lang_code);
  END IF;
END
$$;
