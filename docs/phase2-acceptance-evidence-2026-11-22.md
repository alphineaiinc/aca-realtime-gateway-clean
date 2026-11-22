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
