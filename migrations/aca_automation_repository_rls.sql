-- Phase 2 staging repository isolation. Apply only after correction ledger and NOLOGIN roles.
-- Restricts rows using the authenticated PostgreSQL session_user (not an application-set variable).
-- Explicit provisioning must map each dedicated LOGIN role to allowed repository IDs.
-- Do NOT map the database owner or a shared privileged login. No mappings are seeded.
BEGIN;
CREATE TABLE IF NOT EXISTS aca_automation.repository_role_scopes (
  login_role NAME NOT NULL,
  repository_id BIGINT NOT NULL CHECK (repository_id > 0),
  PRIMARY KEY (login_role, repository_id)
);
REVOKE ALL ON aca_automation.repository_role_scopes FROM PUBLIC;
CREATE OR REPLACE FUNCTION aca_automation.is_authorized_repository(target_repository_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, aca_automation
AS $security$
  SELECT EXISTS(
    SELECT 1 FROM aca_automation.repository_role_scopes
    WHERE login_role = session_user AND repository_id = target_repository_id
  );
$security$;
REVOKE ALL ON FUNCTION aca_automation.is_authorized_repository(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aca_automation.is_authorized_repository(BIGINT)
  TO aca_automation_reader, aca_automation_initializer, aca_automation_writer;
ALTER TABLE aca_automation.correction_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE aca_automation.correction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE aca_automation.correction_ledgers FORCE ROW LEVEL SECURITY;
ALTER TABLE aca_automation.correction_events FORCE ROW LEVEL SECURITY;
CREATE POLICY aca_ledger_read ON aca_automation.correction_ledgers
  FOR SELECT TO aca_automation_reader,aca_automation_initializer,aca_automation_writer
  USING (aca_automation.is_authorized_repository(repository_id));
CREATE POLICY aca_ledger_initialize ON aca_automation.correction_ledgers
  FOR INSERT TO aca_automation_initializer
  WITH CHECK (aca_automation.is_authorized_repository(repository_id));
CREATE POLICY aca_ledger_write ON aca_automation.correction_ledgers
  FOR UPDATE TO aca_automation_writer
  USING (aca_automation.is_authorized_repository(repository_id))
  WITH CHECK (aca_automation.is_authorized_repository(repository_id));
CREATE POLICY aca_event_read ON aca_automation.correction_events
  FOR SELECT TO aca_automation_reader,aca_automation_writer
  USING (aca_automation.is_authorized_repository(repository_id));
CREATE POLICY aca_event_write ON aca_automation.correction_events
  FOR INSERT TO aca_automation_writer
  WITH CHECK (aca_automation.is_authorized_repository(repository_id));
COMMIT;
