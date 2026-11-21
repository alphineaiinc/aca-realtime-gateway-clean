-- Development only: shared nonce replay ledger for signed edge owner proof.
-- NEVER run on production or staging until separately authorized.
BEGIN;
CREATE SCHEMA IF NOT EXISTS aca_automation;
CREATE TABLE IF NOT EXISTS aca_automation.owner_edge_proof_nonces (
 nonce_digest CHAR(64) PRIMARY KEY CHECK(nonce_digest ~ '^[0-9a-f]{64}$'),
 repository_id BIGINT NOT NULL CHECK(repository_id>0),
 expires_at TIMESTAMPTZ NOT NULL,
 claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (expires_at>claimed_at AND expires_at<=claimed_at+INTERVAL '60 seconds')
);
ALTER TABLE aca_automation.owner_edge_proof_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE aca_automation.owner_edge_proof_nonces FORCE ROW LEVEL SECURITY;
REVOKE ALL ON aca_automation.owner_edge_proof_nonces FROM PUBLIC;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aca_owner_edge_nonce_writer') THEN
  CREATE ROLE aca_owner_edge_nonce_writer NOLOGIN;
 END IF;
END $$;
GRANT USAGE ON SCHEMA aca_automation TO aca_owner_edge_nonce_writer;
GRANT INSERT ON aca_automation.owner_edge_proof_nonces TO aca_owner_edge_nonce_writer;
CREATE POLICY aca_owner_edge_nonce_create ON aca_automation.owner_edge_proof_nonces
 FOR INSERT TO aca_owner_edge_nonce_writer WITH CHECK (true);
-- No SELECT/UPDATE/DELETE privileges, NO login membership granted.
COMMIT;
