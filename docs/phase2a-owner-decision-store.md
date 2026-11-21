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
