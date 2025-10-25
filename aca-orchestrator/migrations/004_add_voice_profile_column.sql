-- 004_add_voice_profile_column.sql
-- Story 9.5 – Add JSONB column for tenant voice preference

ALTER TABLE master_tenants
ADD COLUMN IF NOT EXISTS preferred_voice JSONB DEFAULT '{}'::jsonb;
