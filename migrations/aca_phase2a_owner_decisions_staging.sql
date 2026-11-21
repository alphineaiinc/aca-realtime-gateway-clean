-- Phase 2A owner-intent journal. STAGING ONLY, never applied on import.
-- Requires a separately authenticated, repository-scoped owner-decision service.
-- This schema never grants Codex/merge/deploy permission.
BEGIN;
CREATE SCHEMA IF NOT EXISTS aca_automation;
CREATE TABLE IF NOT EXISTS aca_automation.owner_decision_requests (
 request_id CHAR(64) PRIMARY KEY CHECK (request_id ~ '^[a-f0-9]{64}$'),
 repository_id BIGINT NOT NULL CHECK(repository_id>0),
 issue_number INTEGER NOT NULL CHECK(issue_number>0),
 pr_number INTEGER NOT NULL CHECK(pr_number>0),
 head_sha CHAR(40) NOT NULL CHECK(head_sha ~ '^[a-f0-9]{40}$'),
 run_id BIGINT NOT NULL CHECK(run_id>0),
 attempt INTEGER NOT NULL CHECK(attempt BETWEEN 1 AND 2),
 owner_id BIGINT NOT NULL CHECK(owner_id>0),
 issued_at TIMESTAMPTZ NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved_intent','rejected')),
 decided_at TIMESTAMPTZ,
 decided_by BIGINT,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+INTERVAL '30 minutes'),
 CHECK((state='pending' AND decided_at IS NULL AND decided_by IS NULL)
    OR (state<>'pending' AND decided_at IS NOT NULL AND decided_by=owner_id)),
 UNIQUE(repository_id,issue_number,pr_number,head_sha,run_id,attempt,owner_id)
);
CREATE TABLE IF NOT EXISTS aca_automation.owner_decision_events (
 request_id CHAR(64) NOT NULL REFERENCES aca_automation.owner_decision_requests(request_id) ON DELETE RESTRICT,
 event_type TEXT NOT NULL CHECK(event_type IN ('created','approved_intent','rejected')),
 actor_id BIGINT NOT NULL CHECK(actor_id>0),
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (request_id,event_type)
);
CREATE OR REPLACE FUNCTION aca_automation.reject_owner_decision_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'owner_decision_events_are_immutable'; END; $$;
DROP TRIGGER IF EXISTS owner_decision_events_immutable ON aca_automation.owner_decision_events;
CREATE TRIGGER owner_decision_events_immutable
BEFORE UPDATE OR DELETE ON aca_automation.owner_decision_events
FOR EACH ROW EXECUTE FUNCTION aca_automation.reject_owner_decision_event_mutation();
-- FORCE RLS; new objects have no policy until reviewed and explicitly applied.
ALTER TABLE aca_automation.owner_decision_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE aca_automation.owner_decision_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE aca_automation.owner_decision_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE aca_automation.owner_decision_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON aca_automation.owner_decision_requests,aca_automation.owner_decision_events FROM PUBLIC;
COMMIT;
