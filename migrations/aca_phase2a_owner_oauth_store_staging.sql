-- Phase 2A development-only OAuth state/session store. Do not apply in live Neon
-- or configure a public route without explicit owner review.
BEGIN;
CREATE SCHEMA IF NOT EXISTS aca_automation;
CREATE TABLE IF NOT EXISTS aca_automation.owner_oauth_pending (
  digest CHAR(64) PRIMARY KEY CHECK(digest ~ '^[0-9a-f]{64}$'),
  state_digest CHAR(64) NOT NULL CHECK(state_digest ~ '^[0-9a-f]{64}$'),
  encrypted_verifier TEXT NOT NULL CHECK(length(encrypted_verifier) BETWEEN 60 AND 1024),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK(expires_at>created_at AND expires_at<=created_at+INTERVAL '5 minutes')
);
CREATE TABLE IF NOT EXISTS aca_automation.owner_oauth_sessions (
  digest CHAR(64) PRIMARY KEY CHECK(digest ~ '^[0-9a-f]{64}$'),
  owner_id BIGINT NOT NULL CHECK(owner_id>0),
  csrf_digest CHAR(64) NOT NULL CHECK(csrf_digest ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK(expires_at>created_at AND expires_at<=created_at+INTERVAL '15 minutes')
);
ALTER TABLE aca_automation.owner_oauth_pending ENABLE ROW LEVEL SECURITY;
ALTER TABLE aca_automation.owner_oauth_pending FORCE ROW LEVEL SECURITY;
ALTER TABLE aca_automation.owner_oauth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE aca_automation.owner_oauth_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON aca_automation.owner_oauth_pending,aca_automation.owner_oauth_sessions FROM PUBLIC;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aca_owner_oauth_store') THEN
 CREATE ROLE aca_owner_oauth_store NOLOGIN;
 END IF;
END $$;
GRANT USAGE ON SCHEMA aca_automation TO aca_owner_oauth_store;
GRANT SELECT,INSERT,DELETE ON aca_automation.owner_oauth_pending TO aca_owner_oauth_store;
GRANT SELECT,INSERT,DELETE ON aca_automation.owner_oauth_sessions TO aca_owner_oauth_store;
CREATE POLICY aca_owner_oauth_pending_store ON aca_automation.owner_oauth_pending
 FOR ALL TO aca_owner_oauth_store USING (true) WITH CHECK (true);
CREATE POLICY aca_owner_oauth_session_store ON aca_automation.owner_oauth_sessions
 FOR ALL TO aca_owner_oauth_store USING (true) WITH CHECK (true);
-- No UPDATE policy, no UPDATE grant, no group membership, no credentials.
COMMIT;
