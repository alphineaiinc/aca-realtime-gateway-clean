-- ACA-029: additive only; no customer assignments or workflow behavior is seeded.
BEGIN;
CREATE TABLE public.tenant_phone_numbers (
  phone_number TEXT PRIMARY KEY CHECK (phone_number ~ '^\+[1-9][0-9]{1,14}$'),
  tenant_id INTEGER NOT NULL REFERENCES public.master_tenants(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE public.voice_workflow_definitions (
  workflow_id TEXT NOT NULL CHECK (workflow_id ~ '^[a-z][a-z0-9_]{0,63}$'),
  version INTEGER NOT NULL CHECK (version > 0),
  schema_json JSONB NOT NULL CHECK (jsonb_typeof(schema_json) = 'object'),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (workflow_id, version)
);
CREATE TABLE public.tenant_workflow_configs (
  tenant_id INTEGER PRIMARY KEY REFERENCES public.master_tenants(id) ON DELETE RESTRICT,
  workflow_id TEXT NOT NULL,
  workflow_version INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (workflow_id, workflow_version)
    REFERENCES public.voice_workflow_definitions(workflow_id, version) ON DELETE RESTRICT
);
CREATE TABLE public.voice_stream_grants (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  call_sid TEXT NOT NULL UNIQUE,
  account_sid TEXT NOT NULL,
  tenant_id INTEGER NOT NULL REFERENCES public.master_tenants(id) ON DELETE RESTRICT,
  called_number TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX voice_stream_grants_expiry_idx ON public.voice_stream_grants(expires_at);
COMMIT;
