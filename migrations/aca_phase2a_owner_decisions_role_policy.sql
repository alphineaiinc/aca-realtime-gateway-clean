-- Phase 2A staging-only owner intent role policy.
-- Apply AFTER owner_decisions_staging.sql and existing repository RLS scope table.
-- No role is provisioned with credentials or granted membership here.
BEGIN;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aca_owner_decision_writer') THEN
   CREATE ROLE aca_owner_decision_writer NOLOGIN;
 END IF;
END $$;
REVOKE ALL ON aca_automation.owner_decision_requests,
 aca_automation.owner_decision_events FROM PUBLIC;
GRANT USAGE ON SCHEMA aca_automation TO aca_owner_decision_writer;
GRANT SELECT,INSERT,UPDATE ON aca_automation.owner_decision_requests
 TO aca_owner_decision_writer;
GRANT SELECT,INSERT ON aca_automation.owner_decision_events
 TO aca_owner_decision_writer;
-- Require exact session_user mapping to permitted repository.
-- RLS remains FORCE, no BYPASSRLS, and reader group receives no access.
CREATE POLICY aca_owner_decision_read ON aca_automation.owner_decision_requests
 FOR SELECT TO aca_owner_decision_writer
 USING (aca_automation.is_authorized_repository(repository_id));
CREATE POLICY aca_owner_decision_create ON aca_automation.owner_decision_requests
 FOR INSERT TO aca_owner_decision_writer
 WITH CHECK (aca_automation.is_authorized_repository(repository_id));
CREATE POLICY aca_owner_decision_update ON aca_automation.owner_decision_requests
 FOR UPDATE TO aca_owner_decision_writer
 USING (aca_automation.is_authorized_repository(repository_id))
 WITH CHECK (aca_automation.is_authorized_repository(repository_id));
CREATE POLICY aca_owner_decision_event_read ON aca_automation.owner_decision_events
 FOR SELECT TO aca_owner_decision_writer
 USING (EXISTS (SELECT 1 FROM aca_automation.owner_decision_requests r
  WHERE r.request_id=owner_decision_events.request_id
   AND aca_automation.is_authorized_repository(r.repository_id)));
CREATE POLICY aca_owner_decision_event_create ON aca_automation.owner_decision_events
 FOR INSERT TO aca_owner_decision_writer
 WITH CHECK (EXISTS (SELECT 1 FROM aca_automation.owner_decision_requests r
  WHERE r.request_id=owner_decision_events.request_id
   AND aca_automation.is_authorized_repository(r.repository_id)));
GRANT EXECUTE ON FUNCTION aca_automation.is_authorized_repository(BIGINT)
 TO aca_owner_decision_writer;
COMMIT;
