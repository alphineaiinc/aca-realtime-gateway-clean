# Phase 2A persistent owner intent — staging-only design

The implementation is an intentionally **unwired** transaction adapter:
`src/automation/phase2aOwnerDecisionStore.js`. Its two operations,
`createPendingDecision` and `persistOwnerIntent`, require a caller-created
PostgreSQL client and a freshly authenticated real owner + current handoff.
Neither function starts an agent, signs, merges or deploys.

`migrations/aca_phase2a_owner_decisions_staging.sql` defines:
- An exact SHA/CI/owner/attempt-bound request with a maximum 30-minute TTL
- A one-time `pending` → `approved_intent` or `rejected` transition
- Append-only `created` and decision audit events
- Forced row-level security on both tables, **without any active policy or grants**

## Intentional activation blocker

The migration is not yet applied to the live Neon staging database.
The new tables **deny all runtime access by default**. Applying a migration,
assigning a narrowly scoped service role, adding RLS policies, verifying
cross-role behavior, and enabling any live endpoint are separate reviewed
actions. The existing `aca_phase2a_runtime_reader` must remain READ ONLY
and must never receive INSERT or UPDATE on either new table.

The database service role must bind to an independently authenticated GitHub
actor, repository, exact handoff, and fresh CI/head before it can use
`persistOwnerIntent`. The adapter cannot perform this authentication itself.
It uses a conditional serializable transaction; conflicting/repeated attempts
must return a blocked state. Future integration needs genuine PostgreSQL
concurrency tests and database-granted role-scoped RLS tests before activation.

## Non-authorizations

An `approved_intent` row is **not** Codex dispatch permission.
No new GitHub comment-triggered API, code-execution path, or reviewer signing.
No approval result can be translated into permission to merge or deploy.
Proof-only staging evidence never substitutes for real issue eligibility.

## Validation

The new unit tests cover creation, duplicate prevention, rejection, replay,
wrong owner, expired/stale head, and missing storage. They use a fake
transaction client; they **do not** prove PostgreSQL race safety by themselves.
Full GitHub CI must pass before the PR can advance toward review.

## Verified in isolated GitHub Actions PostgreSQL

`migrations/aca_phase2a_owner_decisions_role_policy.sql` provisions an
inert NOLOGIN writer group with repository-scoped forced RLS policies.
Membership is NOT assigned to any live account by the migration.
The existing staging runtime reader is never granted owner-decision writes.

`test/postgres-owner-decision.integration.test.js` uses disposable CI login
roles to test actual PostgreSQL row-level security and transactions, including
two simultaneous conflicting owner choices, replay blocking, append-only event
audit enforcement, cross-repository denial, and inability of the ordinary
reader to access the approval journal. It runs only when
`ACA_TEST_DATABASE_URL` exists; the CI workflow injects a local disposable
PostgreSQL 16 service, never Neon.

## Owner identity (not activated)

`src/automation/phase2aOwnerIdentity.js` defines an *unwired* read-only
GitHub identity check using `GET https://api.github.com/user` with a
separate per-user OAuth credential, verified against the pinned numeric owner
ID and login. It rejects a shared read-only service PAT and all unverified
responses. Its returned `verified:true` is only an identity finding; it
does not grant execution permission.

A live authenticated OAuth login/session broker, CSRF protection, token
lifecycle, secure cookie/session storage, and validation that the API request
came from that session are **not built**. Do not accept owner IDs, approval
comments, or the proof-only packet as authentication. Do not configure a
live approval endpoint before those features are independently reviewed.
