-- 004_add_tenant_columns.sql
ALTER TABLE master_tenants
  ADD COLUMN IF NOT EXISTS business_type TEXT,
  ADD COLUMN IF NOT EXISTS preferred_lang TEXT DEFAULT 'en-US',
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;
