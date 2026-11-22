# Phase 2 isolated CI proposal — verification record

Status: **proposal only**. Do not merge, deploy, sign, dispatch agents, or change Neon/Render without separate approval.

## Ten-task batch review
1. Verified branch delta against `aca-auto-005-offline-correction-simulation`: only the proposed workflow file differs before this record.
2. Confirmed no workflow runs were returned for proposal commit `b0fb014c`; **no execution attestation**.
3. Confirmed `workflow_dispatch` is the sole event trigger; no push, PR, schedule, or deployment trigger.
4. Confirmed minimum workflow permissions: `contents: read`.
5. Disabled checkout credential persistence in all three jobs.
6. Confirmed Node 22 unit/syntax job and isolated PostgreSQL 16 integration job are configured.
7. Confirmed eight integration test files named by `scripts/run-postgres-isolated-ci.cjs` exist.
8. Reviewed disposable CI runner guard: requires `GITHUB_ACTIONS=true`, `CI=true`, exact localhost URL/database/user/password, creates separate randomly named databases and drops them with FORCE. These are code-level safeguards, not evidence of a completed run.
9. Confirmed both security regression test files exist; these are **not a replacement** for independent CodeQL scanning. PR #27 has two outdated unresolved CodeQL review threads concerning origin validation.
10. Recorded activation and rollback gates below.

## Activation and rollback gates
- Workflow file exists only on the proposal branch. GitHub manual dispatch normally requires workflow presence on the default branch; no execution is authorized by this proposal.
- Before proposing execution: obtain independent current-head CodeQL/equivalent scan evidence and a safe GitHub Actions activation mechanism. A draft PR may trigger repository automation and must be separately reviewed before creation.
- Do not alter `.github/workflows/ci.yml` main-only triggers, enable agent dispatch, use staging secrets in CI, or modify production.
- Render staging currently live at `8793e0a9f11b1406981a671f8ce4f9135de86e47`, deployment `dep-dc1h2dd9fdbs73ar9ck0`. The new readiness endpoint is not deployed. The `ACA_PHASE2A_DB_READINESS_ENABLED` flag is absent (disabled).
- Rollback for this proposal: do not merge the branch; the live service remains unchanged. If future deployment is authorized, establish a separately verified Render rollback procedure first.
- Success criteria: actual GitHub Actions run IDs and logs, zero failed tests, all eight disposable DB integrations passing, security findings independently resolved, then explicit staging deployment approval.

No CI run, PR, merge, deploy, Render environment update, database mutation, signing, or agent dispatch performed in this batch.
