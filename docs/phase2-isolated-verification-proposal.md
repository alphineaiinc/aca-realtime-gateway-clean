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

## Batch 7 — ten-task static acceptance pass
1. Reconfirmed proposal branch is isolated from Phase 2 development.
2. Reconfirmed no application source changes in proposal branch.
3. Reconfirmed default ACA CI is main-only; do not change it to enable this proposal.
4. Reconfirmed proposal workflow is manual-only; GitHub Actions dispatch is not yet available from the branch alone.
5. Reconfirmed least-privilege workflow permissions and non-persistent checkout credentials.
6. Reconfirmed all referenced Node/security/integration test paths exist.
7. Reconfirmed integration runner's CI-only, localhost-only, disposable database guard.
8. Added a separate `dependency-audit` job: `npm audit --omit=dev --audit-level=high`; this is a dependency advisory check, **not CodeQL**.
9. Rechecked PR #27 CodeQL review threads: two unresolved/outdated findings; current-head independent scan is still pending.
10. Reconfirmed no current-head status checks or completed verification runs. No PR, workflow run, merge, deploy, signing, dispatch, or database mutation was performed.

**Next execution gate:** GitHub Actions workflow dispatch generally requires the workflow to be present on the default branch. Do not merge just to unlock it. The alternative is a separately approved PR-based verification plan with a tightly scoped, reviewed workflow trigger, or a separately approved local/isolated CI run. Security alerts must be independently scanned and adjudicated.

## Batch 8 — execution-path preparation (10 tasks)
1. Confirmed proposal branch remains separate from the development branch.
2. Confirmed manual-only workflow cannot be assumed dispatchable before default-branch registration.
3. Inspected main-only CI trigger; unchanged.
4. Inspected existing `scripts/run-phase2-isolated-tests.ps1` disposable Docker PostgreSQL test path.
5. Added `scripts/run-phase2-verification-proposal.ps1` for safe local security and unit tests.
6. Added exact proposal-branch guard.
7. Added pre-existing `ACA_TEST_DATABASE_URL` refusal guard.
8. Added high-severity dependency audit with nonzero exit handling.
9. Verified script content and required test references on GitHub.
10. Prepared the exact operator invocation below, without executing any tests or changing infrastructure.

Operator invocation from repository root, on Windows PowerShell:
```powershell
git fetch origin
git switch aca-phase2-verification-workflow-proposal
git pull --ff-only origin aca-phase2-verification-workflow-proposal
& ./scripts/run-phase2-verification-proposal.ps1
```
Before invoking, confirm `git status --short` is clean and that no local uncommitted work would be overwritten. Do not paste credentials, tokens, or full database URLs. This local run is **not** independent GitHub CI attestation or CodeQL clearance. Existing disposable PostgreSQL integration script remains separate and requires its dedicated Docker fixture.
