# Phase 2 staging write-denial rehearsal — prepared, NOT executed

**2026-11-21.** This is a safety runbook, not an approval to write to Neon, provision identities, deploy, merge or dispatch agents.

## Read-only facts verified on isolated staging
- Actual login sessions for readers A/B, writer A, initializer A and runtime reader were authenticated and examined.
- Writer A: ledger SELECT/UPDATE, event INSERT; no ledger INSERT/DELETE. Initializer A: ledger SELECT/INSERT; no ledger UPDATE/DELETE. Readers: SELECT only.
- Writer/initializer `is_authorized_repository` returns true for repository 880001, false for 880002 and 1080201236.
- `correction_events_immutable` trigger is enabled and runs BEFORE UPDATE OR DELETE; its trigger function raises `correction_events_are_immutable`.
- Event table columns: repository_id, issue_number, pr_number, sequence, event_id, prior_head_sha, resulting_head_sha, failure_fingerprint, trusted_actor_id; created_at defaults to now(). No user sequences were observed.
- Ledger columns: repository_id, issue_number, pr_number, version (default 0), created_at (default now()).

## Required before any write test
1. Explicit, separately scoped owner approval for **disposable isolated staging-only transactional write tests**, identifying target database and permitted roles. A generic "continue" does not constitute authorization to modify existing staging data.
2. Confirm an isolated disposable branch or independently verified non-production fixture scope; never run against production.
3. Use actual dedicated role logins, not owner `SET ROLE`; validate `session_user` before each attempt.
4. Independent review of test fixture IDs and rollback plan; avoid touching existing repository/PR issue rows.
5. Confirm per-attempt rollback and post-transaction baseline counts, including failure paths. A failed SQL statement aborts its transaction until ROLLBACK; isolate each case.
6. Record SQLSTATE, session role, repository, attempted operation, and post-rollback count **without** logging credentials or sensitive row data.

## Future controlled tests (no SQL writes embedded or run here)
- Reader A/B: deny ledger INSERT/UPDATE/DELETE and event INSERT.
- Writer A: deny cross-repository ledger UPDATE and event INSERT; allow only repository A scoped operations in disposable fixtures; reject event UPDATE/DELETE.
- Initializer A: deny cross-repository ledger INSERT, deny UPDATE/DELETE and event INSERT.
- Runtime reader: deny all mutations, including authorization metadata UPDATE.
- Verify event SELECT RLS with positive and negative event fixtures.
- Confirm unauthorized writes do not change row counts, ledger versions, or event history after rollback.

## Current boundary
`src/automation/phase2StagingWriteTestPreflight.js` checks whether the prerequisite assertions were supplied. It does not verify their truth, access Neon, authorize execution or perform SQL. Even a complete checklist yields `writeExecutionAuthorized:false`. A future operational execution must independently authenticate all evidence and receive separate owner authorization.

**Disposition:** Live database read-only security checks passed within their tested scope. Write-denial acceptance remains **NO-GO** pending controlled execution.
