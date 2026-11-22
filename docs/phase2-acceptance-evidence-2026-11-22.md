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
