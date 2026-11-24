BEGIN;
CREATE TABLE public.aca_customer_requests (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id INTEGER NOT NULL REFERENCES public.master_tenants(id) ON DELETE RESTRICT,
 call_sid TEXT NOT NULL,
 workflow_id TEXT NOT NULL,
 workflow_version INTEGER NOT NULL,
 intent TEXT NOT NULL,
 details JSONB NOT NULL CHECK (jsonb_typeof(details) = 'object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE (tenant_id, call_sid), UNIQUE (id, tenant_id),
 FOREIGN KEY (workflow_id, workflow_version) REFERENCES public.voice_workflow_definitions(workflow_id,version)
);
CREATE TABLE public.aca_request_outbox (
 request_id BIGINT PRIMARY KEY,
 tenant_id INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 delivered_at TIMESTAMPTZ,
 FOREIGN KEY (request_id,tenant_id) REFERENCES public.aca_customer_requests(id,tenant_id) ON DELETE RESTRICT
);
COMMIT;
