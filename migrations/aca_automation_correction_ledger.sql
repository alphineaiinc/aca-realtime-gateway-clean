-- Phase 2 automation ledger: apply only to a separately authorized database.
-- Never execute against production as part of CI or this PR.
BEGIN;
CREATE SCHEMA IF NOT EXISTS aca_automation;
CREATE TABLE IF NOT EXISTS aca_automation.correction_ledgers (
  repository_id BIGINT NOT NULL CHECK (repository_id > 0),
  issue_number INTEGER NOT NULL CHECK (issue_number > 0),
  pr_number INTEGER NOT NULL CHECK (pr_number > 0),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0 AND version <= 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (repository_id, issue_number, pr_number)
);
CREATE TABLE IF NOT EXISTS aca_automation.correction_events (
  repository_id BIGINT NOT NULL,
  issue_number INTEGER NOT NULL,
  pr_number INTEGER NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 2),
  event_id UUID NOT NULL UNIQUE,
  prior_head_sha CHAR(40) NOT NULL CHECK (prior_head_sha ~ '^[0-9a-f]{40}$'),
  resulting_head_sha CHAR(40) NOT NULL CHECK (resulting_head_sha ~ '^[0-9a-f]{40}$'),
  failure_fingerprint TEXT NOT NULL CHECK (length(failure_fingerprint) BETWEEN 8 AND 256),
  trusted_actor_id BIGINT NOT NULL CHECK (trusted_actor_id > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (repository_id, issue_number, pr_number, sequence),
  FOREIGN KEY (repository_id, issue_number, pr_number)
    REFERENCES aca_automation.correction_ledgers(repository_id, issue_number, pr_number)
    ON DELETE RESTRICT
);
-- Runtime role must not have UPDATE/DELETE on these tables.
-- Provision separate migration and runtime roles outside this migration.
COMMIT;
