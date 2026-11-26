-- Destructive rollback of ACA-029 configuration only. Export it first.
-- Stop voice ingress and drain calls before applying. Never restore unsafe routing.
BEGIN;
DROP TABLE public.voice_stream_grants;
DROP TABLE public.tenant_workflow_configs;
DROP TABLE public.voice_workflow_definitions;
DROP TABLE public.tenant_phone_numbers;
COMMIT;
