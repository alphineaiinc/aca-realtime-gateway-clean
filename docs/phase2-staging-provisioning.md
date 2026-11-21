# Phase 2 isolated staging provisioning plan

Status: **not provisioned**. This document is an operator checklist, not permission to deploy.

## Environment boundary
- Create a new Neon staging project/database with **no production data**. Never reuse the production connection string.
- Create a new private Render staging service for the independent reviewer, separate from the ACA voice gateway. No public write endpoints or production traffic.
- Store reviewer signing key only in protected runtime secrets; pin its public key and reviewer service identity outside PR-controlled code. Plan key rotation and revocation.
- Provision separate PostgreSQL LOGIN roles for reader, initializer, and writer. Map to the NOLOGIN privilege roles, use encrypted connections, and prevent runtime accounts from becoming owners, granting roles, or executing DDL.
- Enforce repository authorization in the database or a tightly restricted service boundary, with tests using *different authenticated login identities*; `SET ROLE` from a superuser is insufficient.
- Configure trusted CI workflow ID and GitHub App ID from a trusted operator-controlled configuration source. Confirm check-suite/run provenance and rerun behavior in staging.
- Disable native Codex dispatch, merge, and deploy permissions for the observer.

## Acceptance gates
1. Independent reviewer signs an exact repository/PR/head verdict using an isolated key; spoofed and revoked keys fail.
2. A staging writer cannot read/write another repository's records, even with a forged scope. Event mutation and replay fail.
3. A stale or wrong CI run cannot satisfy required checks. CI outages fail closed.
4. Correction ledger initializes once and caps corrections at two; concurrency and rollback tests pass.
5. The supervisor remains advisory, and a real staging test verifies that no merge, deploy or native Codex dispatch occurs.
6. Capture audit evidence and receive explicit owner approval before any merge or deployment.

## Operator hold points
Provisioning external accounts, creating credentials, setting secrets, deploying staging services, and modifying GitHub permissions are separate privileged operations. Do not execute them through a PR event or a CI test. Never copy production credentials into staging.

## Current limitations
The repository contains a reviewer-provider interface, Ed25519 verification, database-role guard, scoped ledger service adapter, and isolated tests. None establishes a live independently authenticated reviewer, per-repository DB isolation, or complete staging validation. A passing CI run is not production authorization.

## Verified Neon staging resources — 2026-11-20
- Independent project: `alphine-aca-phase2-staging` (project ID `still-cell-80928176`), region `aws-us-east-1`, PostgreSQL 17.
- Default branch `staging` (ID `br-lucky-surf-bcn2xj6u`) and empty `aca_phase2_staging` database.
- Ledger schema and immutable event trigger applied to this independent staging database, with empty correction-ledger and event tables.
- NOLOGIN reader, initializer and writer group roles created; least-privilege grants on ledger tables applied; read-only catalog check verified two tables and three roles.
- No production Neon project/schema or data changed. No authenticated login accounts or row-level security policies provisioned yet. Group roles alone do not establish repository isolation.
- Render has not been connected; no independent reviewer is deployed. Do not report Phase 2 operational readiness.

## Repository RLS staging update
- Applied `migrations/aca_automation_repository_rls.sql` to the isolated staging database only. Both correction tables have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` set; verified 3 ledger policies and 2 event policies via read-only catalog queries.
- A protected repository-to-login mapping table exists and is **empty**. Policies consult PostgreSQL `session_user`, not a caller-controlled application variable. Therefore no runtime repository grants have been issued.
- Real limited LOGIN identities, their role grants, trusted mapping provisioner, and cross-repository adversarial login tests are still required. Do not assert complete isolation without those tests.
