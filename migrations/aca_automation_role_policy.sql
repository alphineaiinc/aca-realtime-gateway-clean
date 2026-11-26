-- Isolated Phase 2 least-privilege policy template.
-- Apply ONLY to a separately provisioned test/service database after
-- creating and authenticating these NOLOGIN group roles out of band.
-- Never apply automatically to production.
BEGIN;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aca_automation_reader') THEN
  CREATE ROLE aca_automation_reader NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aca_automation_initializer') THEN
  CREATE ROLE aca_automation_initializer NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aca_automation_writer') THEN
  CREATE ROLE aca_automation_writer NOLOGIN;
 END IF;
END
$$;
REVOKE ALL ON SCHEMA aca_automation FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA aca_automation FROM PUBLIC;
GRANT USAGE ON SCHEMA aca_automation TO aca_automation_reader,aca_automation_initializer,aca_automation_writer;
GRANT SELECT ON aca_automation.correction_ledgers,aca_automation.correction_events TO aca_automation_reader;
GRANT SELECT,INSERT ON aca_automation.correction_ledgers TO aca_automation_initializer;
GRANT SELECT,UPDATE ON aca_automation.correction_ledgers TO aca_automation_writer;
GRANT SELECT,INSERT ON aca_automation.correction_events TO aca_automation_writer;
-- No role receives UPDATE/DELETE on immutable correction events.
-- No role receives schema DDL or privilege to grant roles.
-- Caller must independently verify authenticated repository/PR/actor scope.
COMMIT;
