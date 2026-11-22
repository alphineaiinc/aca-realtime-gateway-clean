# Phase 2 acceptance evidence and outstanding gates (2026-11-22)

Status: **NOT APPROVED FOR MERGE, DEPLOYMENT, SIGNING OR AGENT DISPATCH**.

## Verified evidence
- Head `8b663b6b26a719c3ea9c49ef02fb9c256197dd95` on `aca-auto-005-offline-correction-simulation`.
- ACA CI run [45031588009](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45031588009): completed successfully. Node suite: 376 total, 368 passed, 0 failed, 8 skipped. PostgreSQL ledger integration passed. Syntax checks passed.
- PR supervision observer run [45031588008](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45031588008): success.
- Exact staging-origin comparison replaced unsafe substring checks in `src/automation/phase2aOwnerMountPreflight.js`. Adversarial URL regression coverage added in `test/phase2a-staging-origin-security.test.js`; existing owner HTTP test fixtures aligned to designated staging hostname.
- Temporary CI-only PR [#112](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/112) closed unmerged; its oversized stacked branch must not be treated as a small mainline security fix.

## Dependency map (do not merge out of order)
- [#21](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/21): read-only PR supervision foundation (draft).
- [#27](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/27): bounded offline correction simulation, stacked on #21 (draft). The security and test changes above reside on this development branch.
- [#25](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/25), [#29](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/29), [#31](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/31): separate security workstreams; no implied approval or dependency on #27.

## Unmet acceptance gates
- [ ] Obtain a fresh, current-head CodeQL scan or equivalent independent static-analysis evidence. Original PR #27 CodeQL review threads for alerts [81](https://github.com/alphineaiinc/aca-realtime-gateway-clean/security/code-scanning/81) and [82](https://github.com/alphineaiinc/aca-realtime-gateway-clean/security/code-scanning/82) are **outdated but unresolved**. Successful ACA CI is not a CodeQL clearance.
- [ ] Confirm the exact allowed staging hostname against the deployed staging service configuration and its GitHub OAuth callback. Current test fixture alone is not deployment evidence.
- [x] Classify 8 skipped Node-suite tests: all eight explicitly require a disposable isolated `ACA_TEST_DATABASE_URL` and are skipped in the generic Node test job when that variable is absent. The dedicated PostgreSQL integration job explicitly runs all eight corresponding integration test files against its disposable PostgreSQL 16 service, and all eight invocations passed in CI run 45031588009. Generic Node job skips are therefore expected and covered separately.
- [ ] Reconcile the #21 -> #27 stacked dependency and isolate a small reviewable change before any mainline merge proposal.
- [x] Execute the eight database-dependent integration test files in the separate disposable PostgreSQL service job with isolated `ACA_TEST_DATABASE_URL` (CI run 45031588009).
- [ ] Run controlled end-to-end staging owner OAuth/approval flow, including deny/rollback and non-dispatch checks, with no production access.
- [ ] Obtain explicit owner approval for any future merge, signing, agent dispatch or deployment; each action requires separate authorization.

## Safety boundaries
All acceptance checks remain advisory. No merge, deployment, production database write, credential exposure, signing or agent dispatch is authorized by passing tests.

## Render staging deployment comparison (read-only, 2026-11-22)
- Confirmed workspace `tea-d3rfdemr433s73e3nnfg` and service `srv-dc0rjq2vcj2c73bi7v5g` (`alphine-aca-phase2a-correction-staging`). Its URL matches the exact trusted hostname and automatic deploy is disabled.
- Last live deployment `dep-dc0ssd97lnhs739ln0dg` runs commit `a2ff24350221f6e611c4602f831d3e77d29e8b6a`, older than development head `3c1e692074d86f4172a123285c8668c6d1a4a3d7` at inspection.
- `src/automation/phase2aOwnerMountPreflight.js` is absent at deployed SHA but present on development head. Therefore latest staging-origin guard and associated owner approval flow are **not validated on live staging**.
- `src/automation/reviewerStagingServer.js` also differs: development head adds GitHub App private-key secret-file reader; deployed SHA uses the earlier key loading path.
- Production service `aca-realtime-gateway-clean` is distinct and remains untouched. No Render changes were made.
- [ ] Review staging deployment delta and dependencies, including service entrypoint, secrets references (names only), database role separation, and rollback plan. Deployment requires explicit owner authorization.
- [ ] After an authorized staging-only deployment, validate health, fail-closed denial, origin/callback checks, and no merge/sign/dispatch permissions.

## Staging credential and deployment prerequisites (read-only code review)
- New `reviewerGithubAppSecretFile.js` requires the GitHub App private key at fixed Render secret-file path `/etc/secrets/github-reviewer-app.pem` and `ACA_REVIEW_GITHUB_APP_PRIVATE_KEY_PATH` set to that exact path. No environment-key fallback is permitted. Never print or copy the private key into CI, docs, or logs.
- New `reviewerStagingServer.js` calls the pinned key reader for authenticated GitHub review/triage. A successful old deployment does not establish the new path is configured.
- [ ] Confirm **names and presence only** of the Render staging secret file and environment variable; do not retrieve or display secret contents.
- [ ] Confirm `ACA_PHASE2A_ENABLED`, `ACA_PHASE2A_PREFLIGHT`, `ACA_PHASE2A_SMOKE_ENABLED`, and `ACA_PHASE2A_POSITIVE_PROOF_ONCE` are in the intended safe disabled state before any deployment; review staging database role and isolation separately.
- [ ] Confirm rollback to known live deployment `dep-dc0ssd97lnhs739ln0dg` and require explicit staging-only deploy approval. Do not deploy by default.

## Deployment delta gate (2026-11-22)
- Read-only GitHub compare of deployed `a2ff24350221f6e611c4602f831d3e77d29e8b6a` to development branch: **201 commits ahead, zero behind, 113 changed files**. This is a broad feature/migration/workflow delta, not a narrow security patch.
- Render events show the previous staging build and deploy succeeded; automatic deployment remains off. The latest branch was **not deployed**.
- **Decision: HOLD staging deployment** pending focused release-scope review, database-role/migration dependency verification, staging secret-file/path confirmation without exposing secrets, and explicit authorization for a specific deployment SHA.
- No merge, signing, agent dispatch, production access, or Render configuration changes authorized by this review.

## Staging release dependency review (2026-11-22, code-only)
- `phase2aStagingClients.js` requires `ACA_PHASE2A_DATABASE_URL`, `ACA_PHASE2A_EXPECTED_NEON_HOST`, `ACA_PHASE2A_EXPECTED_DATABASE`, and `ACA_PHASE2A_LEDGER_ROLE` to agree exactly on host, database and authenticated username. It also requires a separate `ACA_PHASE2A_GITHUB_READ_TOKEN`; absent/mismatched dependencies return no clients. **Live values/role identity not inspected.**
- `aca_phase2a_owner_decisions_staging.sql` creates an immutable owner event journal with FORCE RLS and revoked PUBLIC access. `aca_phase2a_owner_decisions_role_policy.sql` must be applied afterward and requires existing `aca_automation.is_authorized_repository(BIGINT)` and repository-scoped authorization infrastructure. Do not apply migrations out of order.
- `aca_phase2a_owner_oauth_store_staging.sql` defines a separate NOLOGIN OAuth store role with SELECT/INSERT/DELETE only, FORCE RLS and no UPDATE grant. No role credentials or memberships are provisioned by these migrations.
- Source review is **not** proof of actual staging Neon role separation, migration application, TLS/mTLS ingress, or rollback. These remain release blockers.
- Release recommendation: **HOLD** broad branch deployment (201 commits / 113 files since live SHA); isolate reviewable release slices, verify staging-only Neon identity and migration prerequisites using read-only evidence, and obtain specific approval before any deploy or migration.

## Live isolated Neon staging inventory (2026-11-22, SELECT-only)
- Verified Neon project `still-cell-80928176` (`alphine-aca-phase2-staging`), branch `br-lucky-surf-bcn2xj6u` (`staging`), database `aca_phase2_staging`. **Not** production project `blue-night-09261872` (`aca_main`).
- `session_user=current_user=aca_staging_owner` for inspection; this does **not** verify app login identity.
- `aca_automation_reader` and `aca_automation_writer` exist as NOLOGIN roles without BYPASSRLS. `aca_automation.is_authorized_repository(bigint)` exists.
- Existing `aca_automation.correction_events` and `correction_ledgers` have RLS enabled and FORCE; `repository_role_scopes` does not have RLS (authorization mapping table, inspect grants before operational approval).
- Owner tables (`owner_decision_requests`, `owner_decision_events`, `owner_oauth_pending`, `owner_oauth_sessions`) and owner roles (`aca_owner_decision_writer`, `aca_owner_oauth_store`) **are absent**. Owner migration dependency not satisfied in live staging; no migration applied.
- **HOLD** broad staging deployment and owner endpoints. Next: inspect existing role grants/function security and design disposable-branch migration rehearsal before any staging write authorization.

## Live Neon grants and security-definer audit (2026-11-22, SELECT-only)
- `aca_automation.is_authorized_repository(bigint)` is STABLE SECURITY DEFINER owned by `aca_staging_owner`, with fixed `search_path=pg_catalog, aca_automation`; checks `repository_role_scopes.login_role=session_user` and exact repository ID.
- `correction_events` and `correction_ledgers` have FORCE RLS; PUBLIC lacks SELECT. `aca_automation_reader` has SELECT; `aca_automation_writer` has SELECT and events INSERT, but no ledger INSERT.
- `repository_role_scopes` has no RLS; PUBLIC, `aca_automation_reader`, `aca_automation_writer`, and test logins have no SELECT/INSERT. **`aca_phase2a_runtime_reader` has SELECT on this mapping table** and no INSERT: review whether this is intentional least-privilege before release.
- `aca_staging_owner` can LOGIN and has BYPASSRLS; never use this privileged owner as the application runtime identity. `aca_phase2a_runtime_reader` can LOGIN and does not have BYPASSRLS. Runtime connection identity remains unverified from Render configuration.
- No SQL writes or role changes made. Next: inspect runtime reader's effective grants and role memberships, and plan disposable branch migration rehearsal; HOLD activation.

## Runtime role membership and migration rehearsal plan (2026-11-22, SELECT-only)
- `aca_phase2a_runtime_reader` LOGIN=true, BYPASSRLS=false, direct membership `{aca_automation_reader}`, SELECT on correction ledgers/events, no correction event INSERT. It also has a **direct non-grantable SELECT** on `aca_automation.repository_role_scopes`; this grant is not inherited from the reader group and needs least-privilege justification/revocation review before rollout.
- Test logins `aca_p2_reader_a` and `aca_p2_reader_b` inherit only reader group and lack mapping SELECT; `aca_p2_writer_a` inherits writer and has event INSERT. `aca_staging_owner` is privileged and must never be the runtime login.
- Disposable-branch rehearsal plan (NOT executed): (1) create disposable branch from `br-lucky-surf-bcn2xj6u` only with separate approval; (2) inventory preexisting schema and migration order; (3) run owner-decision base schema then scoped role policy, and OAuth store schema only if owner-browser slice is included; (4) validate RLS with actual restricted LOGIN identities and denied writes/cross-repo access; (5) rollback/drop disposable branch; (6) retain logs and signed-off results. No production project access.
- No branch created, SQL mutation, credential changes, deployment, merge, signing or dispatch. **HOLD** until scope, grants, and isolated rehearsal are approved.

## Restricted-login live read probes (2026-11-22, SELECT-only)
- Neon staging project `still-cell-80928176`, branch `br-lucky-surf-bcn2xj6u`, database `aca_phase2_staging`; connected as actual `aca_phase2a_runtime_reader`: `session_user=current_user=aca_phase2a_runtime_reader`; counts: 5 rows visible in `repository_role_scopes`, 1 ledger, 0 events. No sensitive mapping values selected.
- Connected independently as actual `aca_p2_reader_a`: `session_user=current_user=aca_p2_reader_a`; counts: 1 ledger, 0 events. No writes or role switching.
- Runtime reader has direct SELECT over *all 5* repository-role mapping rows; no RLS on mapping table. **Least-privilege decision needed**: remove direct SELECT after verifying no runtime dependency; rely on SECURITY DEFINER `is_authorized_repository` for ledger/event RLS. Do not revoke without scoped authorization and regression tests.
- These counts alone do **not** prove cross-repository denial, no app-connection identity, or secure Render deployment. Disposable migration rehearsal remains unexecuted. HOLD broad staging deployment.

## Mapping-table grant dependency assessment (2026-11-22, source review)
- `src/automation/phase2aStagingClients.js` creates a pinned-host Postgres pool and GitHub read client; its source contains **no direct SELECT of** `aca_automation.repository_role_scopes` and no requirement for the direct mapping-table grant. The ledger RLS authorization function is SECURITY DEFINER and consults the table on behalf of scoped callers.
- This is a **bounded source-path review**, not an exhaustive repository-wide reference search or runtime dependency proof. Recommend staging-only regression using actual `aca_phase2a_runtime_reader` login on a disposable branch with direct SELECT revoked, validating scoped ledger reads and cross-repo denial before any permanent grant change.
- Do not revoke staging grants yet; do not create disposable branches or apply owner migrations without separate scope approval. No production access or deployment.

## Disposable Neon runtime mapping-grant regression (2026-11-22)
- Created isolated child branch `br-withered-wildflower-bcdwu6ag` (`phase2a-grant-regression-disposable-20261122`) from staging parent `br-lucky-surf-bcn2xj6u` in project `still-cell-80928176`; database `aca_phase2_staging`.
- Baseline as actual `aca_phase2a_runtime_reader`: mapping SELECT=true, scoped ledger count=1.
- On **disposable branch only**, executed `REVOKE SELECT ON TABLE aca_automation.repository_role_scopes FROM aca_phase2a_runtime_reader`.
- Post-revoke as actual runtime reader: mapping SELECT=false, scoped ledger count=1, events count=0, `is_authorized_repository(1080201236)=true`; unrelated repository ID 9223372036854775807 authorization=false and ledger count=0. This confirms the targeted direct grant is not necessary for these scoped queries; it does not establish exhaustive application compatibility.
- Independently rechecked **original staging parent**: runtime reader mapping SELECT remains **true** (unchanged). Production not accessed.
- Disposable child branch remains available for further isolated verification; do not apply the grant change to original staging until explicit authorization and broader tests. No deploy, merge, signing or dispatch.

## Disposable Neon multi-login repository regression (2026-11-22, SELECT-only)
- On disposable child `br-withered-wildflower-bcdwu6ag`, tested real login identities after runtime reader's direct mapping SELECT revoke: `aca_phase2a_runtime_reader`, `aca_p2_reader_a`, `aca_p2_reader_b`, `aca_p2_writer_a`.
- All four lack mapping-table SELECT. RLS-visible correction ledger IDs by role: runtime reader=1080201236 (1), reader A=880001 (1), reader B=880002 (1), writer A=880001 (1). No other repository ledgers returned in grouped SELECT.
- Runtime reader and reader A/B lack event INSERT grant; writer A has event INSERT grant. No INSERT attempted. Authorization check for runtime reader's expected repo 1080201236=true, unrelated 9223372036854775807=false. Reader A/B and writer A correctly returned false for 1080201236; their respective RLS-visible repository IDs were verified separately.
- Result: **PASS for scoped read isolation and privilege metadata on tested fixtures**; not a proof of write denial, all application call paths, or live Render credentials. Original staging grant remains unchanged. Disposable branch retained; deletion requires explicit branch-specific instruction.

## Disposable grant-regression branch cleanup (2026-11-22)
- Deleted only Neon staging disposable branch `br-withered-wildflower-bcdwu6ag` (`phase2a-grant-regression-disposable-20261122`) from project `still-cell-80928176` after user continuation approval.
- Verified branch listing now contains only original `br-lucky-surf-bcn2xj6u` (`staging`).
- Rechecked original staging as actual `aca_phase2a_runtime_reader`: direct mapping SELECT still true and authorized ledger count=1. No parent grant changes.
- Proposed permanent staging correction, **NOT EXECUTED**: `REVOKE SELECT ON TABLE aca_automation.repository_role_scopes FROM aca_phase2a_runtime_reader;` only on project `still-cell-80928176`, branch `br-lucky-surf-bcn2xj6u`, database `aca_phase2_staging`. Before application: verify Render runtime identity and any other direct mapping-table consumers; afterward: rerun actual-login ledger/RLS and authorization tests; rollback is `GRANT SELECT ON TABLE aca_automation.repository_role_scopes TO aca_phase2a_runtime_reader;` under staging-owner authorization.
- No deploy, merge, signing, dispatch or production operations.

## Render runtime identity verification boundary (2026-11-22)
- Read-only Render service inspection confirms correction staging `srv-dc0rjq2vcj2c73bi7v5g` tracks `aca-auto-005-offline-correction-simulation`, and reviewer staging `srv-dc0ibfuc6qcc73ef4m70` tracks `aca-auto-004-phase2-pr-supervision-policy`; both autoDeploy=no, autoDeployTrigger=off.
- Render management connector exposes service configuration but **not** the secret `ACA_PHASE2A_DATABASE_URL`, `ACA_PHASE2A_LEDGER_ROLE`, `ACA_PHASE2A_EXPECTED_DATABASE` or expected Neon host values. Therefore **runtime login identity remains unverified**. Do not infer it from the presence of the Neon role or code validation alone.
- Non-secret owner check required in Render correction staging Environment: verify `ACA_PHASE2A_LEDGER_ROLE=aca_phase2a_runtime_reader`, `ACA_PHASE2A_EXPECTED_DATABASE=aca_phase2_staging`, and `ACA_PHASE2A_EXPECTED_NEON_HOST` corresponds to staging project, without sharing passwords or connection URLs. Verify `ACA_PHASE2A_DATABASE_URL` username/host/database locally in dashboard without pasting its value into chat. Avoid any deploy/save actions.
- Permanent staging grant REVOKE remains **NOT AUTHORIZED/NOT EXECUTED** pending that check and an exhaustive runtime dependency assessment.

## Operator-confirmed Render ledger role and source-search limitation (2026-11-22)
- Operator confirmed correction staging Environment `ACA_PHASE2A_LEDGER_ROLE` exactly matches `aca_phase2a_runtime_reader` (non-secret value). This confirms configured role label only; it does **not** prove that the database URL's username, host, or database match or that the currently deployed process uses the latest branch code.
- GitHub code-search attempts for `repository_role_scopes`, `ACA_PHASE2A_LEDGER_ROLE`, `is_authorized_repository` returned no results; this search covers the **default branch**, not the Phase 2 development branch, so no inference of absent development-branch dependencies is warranted.
- Rechecked original staging under actual `aca_phase2a_runtime_reader`: mapping SELECT remains true and scoped ledger count=1. No privilege change.
- Next gate: operator independently confirms non-secret expected database `aca_phase2_staging` and staging Neon hostname pin, and that the secret connection URL targets that same project without revealing it. Then perform targeted branch-specific dependency review before requesting a permanent staging REVOKE.

## Database-name gate and branch-specific source review (2026-11-22)
- User confirmed Render expected staging Neon hostname matches the hostname shown by Neon, and ledger role matches `aca_phase2a_runtime_reader`. User has **not yet confirmed** `ACA_PHASE2A_EXPECTED_DATABASE=aca_phase2_staging`, nor the actual secret connection URL target.
- Reviewed development-branch `src/automation/phase2aStagingClients.js`: client returns null unless the URL hostname equals `ACA_PHASE2A_EXPECTED_NEON_HOST`, decoded URL database equals `ACA_PHASE2A_EXPECTED_DATABASE`, and decoded username equals `ACA_PHASE2A_LEDGER_ROLE`. The pool is only created after all checks; no connection is made at construction.
- Reviewed `docs/phase2-integration-dependency-map.md`: broad integration spans correction ledger, OAuth/owner decisions and private mTLS; no proof yet that all branch code paths avoid direct mapping-table SELECT. **Do not apply permanent staging REVOKE** based only on the bounded adapter review.
- Next owner non-secret check: Render Environment `ACA_PHASE2A_EXPECTED_DATABASE` equals `aca_phase2_staging`; owner should independently verify URL database/user/host locally without sharing the secret. No database mutations, deployments or merges.

## Operator expected database confirmation and targeted SQL call-path audit (2026-11-22)
- Operator confirms `ACA_PHASE2A_EXPECTED_DATABASE=aca_phase2_staging`; previously confirmed ledger role and expected staging Neon hostname. **Secret `ACA_PHASE2A_DATABASE_URL` actual host/user/database and deployed commit remain unverified.**
- Development-branch `src/automation/phase2aStagingClients.js` rejects mismatched URL hostname/database/login; this is fail-closed configuration validation, not evidence of actual live connection.
- Targeted development-branch review of `src/automation/reviewerStagingServer.js` (positive proof path), `src/automation/postgresCorrectionLedger.js`, `src/automation/correctionLedger.js`, `src/automation/automationLedgerService.js` found no direct SQL reference to `aca_automation.repository_role_scopes` in these files. Reviewer positive-proof path queries `current_user` and table grants; it is gated by `ACA_PHASE2A_POSITIVE_PROOF_ONCE=true` and does not run in disabled state.
- `postgresCorrectionLedger.js` implements a **separate write adapter** (`INSERT correction_events`, `UPDATE correction_ledgers`) requiring an authenticated write-capable client. It must not be connected to the read-only Phase2A runtime identity. No adapter invocation or writes were performed in this review.
- Recommendation: keep permanent staging REVOKE on hold until actual connection URL target verified privately and branch-wide SQL consumer inventory completed. No mutations/deploys/merges/signing/dispatch.

## Post-deployment read-only staging role and runtime inspection (2026-11-22)
- Render Correction Staging service `srv-dc0rjq2vcj2c73bi7v5g` latest deployment `dep-dc1h2dd9fdbs73ar9ck0` at `8793e0a9f11b1406981a671f8ce4f9135de86e47` is LIVE; Render build/deploy events succeeded and runtime logs show `node src/automation/reviewerStagingServer.js` and port 10000. Auto deploy remains off. Env URL update triggered a full build/deploy unexpectedly; do not treat it as an authorized general code rollout.
- Read-only Neon staging queries explicitly authenticated as `aca_phase2a_runtime_reader`: `current_user=session_user=aca_phase2a_runtime_reader`, database `aca_phase2_staging`, `pg_read_all_data` membership false; correction_ledgers and correction_events SELECT true, INSERT/UPDATE/DELETE false; repository `1080201236` visible ledger count 1, unrelated repository `9223372036854775807` count 0.
- Deployed code review: `GET /health` reports static fail_closed mode, not an actual DB connectivity check. `POST /phase2a/correction-request` requires bearer authorization and depends on separately created clients. Client construction is gated by enabled flag and credential/identity checks. Startup proof, preflight and smoke are each separately gated.
- **Outstanding:** cannot read actual Render env flags/secrets via read-only connector; cannot infer runtime client initialized from health or live status; no authenticated request, no app-to-Neon connectivity probe, no mutation. Keep proof/smoke/preflight off, and no permanent grant changes or production actions.
