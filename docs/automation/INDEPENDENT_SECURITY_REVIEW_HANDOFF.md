# Independent Security Review Handoff — Phase 2 Agent Manager

Prepared from the currently verified draft pull-request heads. This document is an evidence index for an independent reviewer, not a security approval or activation authorization.

## Exact revisions and CI evidence

| PR | Purpose | Exact head | Draft state | CI evidence |
|---|---|---|---|---|
| #21 | Reviewer supervision and trusted disposition | `b9592ac3aa6b131e32850c7bf036a380e11c3497` | Open, draft | ACA CI #1035 / [45465109963](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45465109963); PR Supervision Event Observer #574 / [45465110108](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45465110108); Reviewer staging HTTP smoke #44 / [45465110229](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45465110229) — all successful |
| #142 | Eight-agent manager, durable queue and SEC-09 reconciliation | `7f9e0bcc0ca3650d00b533f24afca754f8b70f31` | Open, draft | ACA CI #1075 / [45471444110](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45471444110) — successful; Node tests and isolated PostgreSQL integration steps successful |
| #146 | Protected sandbox harness | `ae83005234886637b90ef8e4f6397eac521e6012` | Open, draft | ACA CI #1043 / [45465837929](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45465837929) — successful |

## SEC-09 evidence added to PR #142

- Draft migration source adds `engineering_team_publication_reconciliation`, keyed to a reserved publication binding, with exact product/repository/revision fields, observation digest and immutable-row trigger. PUBLIC UPDATE/DELETE/TRUNCATE are revoked. Migration has not been applied.
- `publicationReconciliationStore.js` requires authenticated requester context, an unexpired separately approved request, exact binding/evidence equality, reservation row locking, a second authentication check, independent evidence verification and transactional persistence.
- `githubPublicationEvidenceBoundary.js` separates collection and verification transports and token-provider interfaces. Both perform read-only GitHub GETs, bind repository, base/head branches and SHAs, reject non-200 or incomplete single-page results, and independently re-fetch observations.
- Disposable PostgreSQL integration exercises the real boundary wiring, successful durable observation, idempotent replay, UPDATE/DELETE rejection and rollback with no persisted row when independent verification observes a changed head.
- Unit coverage tests transport separation, scope substitution, tampering, incomplete pagination and non-200 responses.

## Reviewer questions and operational limitations

1. Independently inspect database role ownership and ensure the migration's trigger and privileges cannot be bypassed by the runtime role, table owner, privileged roles or alternate write paths. PUBLIC revocation alone is not proof of effective least privilege.
2. Verify that the two operational read-only identities and their token providers are genuinely independently controlled. The repository changes define separate interfaces; no credentials were provisioned and independent custody has not been demonstrated.
3. Validate the GitHub evidence API pagination and completeness strategy. Current collector fails closed at 100 results rather than paginating; it does not interpret truncated results as absence.
4. Confirm the approval, reservation and reconciliation transaction invariants against the production-intended schema and database roles. No database migration or production test was performed.
5. For PR #21, independently verify signer custody, protected/pinned verification key, revocation/rotation and substantive disposition verification. Passing CI is not evidence of independent signer control.
6. For PR #146, independently verify protected workflow/image publisher provenance, runtime fault acceptance, runner teardown/quarantine and exact executable/workflow/run-attempt evidence binding. Passing CI is not operational runner acceptance.

## Security disposition

**HOLD — independent review required.** CI success establishes that the listed automated workflows passed for the listed exact revisions. It does not establish independent signer custody, operational identity separation, production database privileges, protected runner provenance, runtime acceptance, or authorization to activate the Agent Manager.

## Restrictions observed during this work

No merges, deployments, database migrations, credential provisioning, signing, production changes or engineering-agent dispatch. Additional spending: CAD $0.


## Follow-up source remediation (November 24, 2026)

- PR #21 head `b9592ac3aa6b131e32850c7bf036a380e11c3497`: added SEC-08 regression coverage for fresh-challenge replay mismatch and legacy approval-only envelope rejection; updated reviewer trust gate documentation.
- PR #146 head `ae83005234886637b90ef8e4f6397eac521e6012`: added a workflow regression test asserting the active protected sandbox workflow remains manually dispatched, permissionless and denial-only; updated sandbox acceptance evidence documentation. Proposed runtime workflow remains inactive.
- PR #142 remains at `bc592afdea87dde99ae292d20b63a9f3e079175b` for this handoff update; its exact-head CI run #1076 [45471678963](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45471678963) passed.
- These are source-level checks only. They do not establish independent signer custody, actual identity separation, protected publisher provenance, runner teardown/quarantine, or operational runtime acceptance. Independent review remains HOLD.


## Latest coordinated verification and SEC-09 append-only correction

- PR #21 revision `b9592ac3aa6b131e32850c7bf036a380e11c3497`: ACA CI #1079, observer #576 and staging smoke #46 completed successfully.
- PR #146 revision `ae83005234886637b90ef8e4f6397eac521e6012`: ACA CI #1080 completed successfully.
- PR #142 revision `d05e79677bb28718a4a092a801a6f889334307d1`: ACA CI #1081 completed successfully, including Node tests and disposable PostgreSQL integration.
- Follow-up SEC-09 commits add a statement-level PostgreSQL `BEFORE TRUNCATE` trigger for the append-only reconciliation table and an integration assertion that UPDATE, DELETE and TRUNCATE are rejected with SQLSTATE `P0001`. These changes are committed as source and tests only; migration is not applied. Exact-head CI for the new follow-up revision is pending.
- The source-level SEC-08 and SEC-11–13 additions remain as recorded above. No independent signer custody, operational key ownership, privileged database role isolation, trusted image publisher provenance, or external runner teardown acceptance is established by CI.

**Disposition remains HOLD.** All listed CI results are scoped to their exact revisions. New SEC-09 changes require fresh CI before acceptance. No merge, deployment, migration, credential provisioning, signing, production change or agent dispatch occurred. Additional spend: CAD $0.

## Follow-up offline verifier checkpoint
Previously verified CI: PR #21 `64aed92779d5cedb75c2d967bdaef7d6b8af60fe` [45473844726](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45473844726); PR #142 `ec5445743017f47f4e7581b5385d96e1ca6bb2bc` [45474267947](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45474267947); PR #146 `7085b72ba896e90f0821cbb06c15458fec18dfc5` [45474639247](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45474639247). All successful at those exact revisions only.
PR #146 new checkpoint `e37d848fdb37f4195c63fb352f20e38515ce1571` adds offline acceptance integration, per-pin key status checks, expiry revalidation and mutation/denial regression tests. Fresh CI required. The baseline fault claims remain unsigned; independent protected fault evidence, signer custody, operational revocation and replay management remain unresolved. No execution authorization. SEC-09 also requires correction of approval/reservation/transport digest semantics: the reconciliation store currently equates approval binding with evidence digest and treats approval head as candidate head; the disposable fixture does not prove the real reservation-to-reconciliation path. Independent review must remain HOLD until these are resolved. No operational changes or additional spending.

## SEC-09 publication binding correction
The durable owner approval binds the publication digest, not the approval identifier digest or the raw request evidence digest. The shared publicationBinding function is used by reservation and transport. Reservation stores request evidence, exact base and candidate revisions and both branches; reconciliation recomputes the publication and approval digests and checks the persisted scope before observation or replay. Disposable PostgreSQL regression uses actual durable request, owner decision and reservation APIs with distinct base/candidate revisions and rejects candidate and approval-binding substitution. Draft SQL source only; no migration applied. PR #146 `fe977b3b64ad3540cf9f5568b29da7f847520138` authenticated five runner fault outcomes and passed ACA CI #1121 (45487768540). Operational independent acceptance, custody, role isolation and protected provenance remain HOLD. No live admission, merge, deploy or dispatch. CAD $0 additional spending.

## Coordinated review checkpoint — November 24, 2026
Verified prior exact-head CI: #21 `64aed92779d5cedb75c2d967bdaef7d6b8af60fe` (45473844726); #142 `3022b810f58039b6f18d03b02ff9d81352fe78e2` (45489357218, including disposable PostgreSQL integration); #146 `fe977b3b64ad3540cf9f5568b29da7f847520138` (45487768540). These are historical successful checkpoints, not evidence of CI for this new revision.
SEC-09 follow-up bounds the real Fetch response to 2 MiB, requests a 10-second abort signal and redirect denial, rejects duplicate/malformed rows and pagination indicators, and preserves conflicting binding/branch claims through classification. Separate token providers must return unequal valid token values; this is NOT proof of independent identities or custody. Custom fetch/token implementations must obey deadlines and protected transport contracts. Pagination remains fail-closed; repositories with 100 or more PR results are not accepted by this reader. Request evidence preimage validation at reservation, protected database roles, independent custody, protected sandbox provenance and operational signer revocation remain review gates. No live admission or execution enabled. Fresh exact-head CI and independent review required. HOLD, CAD $0 additional spend; no merge/deploy/migration/credential provisioning/signing/dispatch.

## Offline request preimage validation
Reservation and transport share request validation: exact product/repository/base scope, draft-only policy, all three evidence digests and recomputed request digest. Transport uses a frozen snapshot across asynchronous calls. Disposable PostgreSQL fixtures exercise rejection of missing, modified and substituted request preimages. This proves digest consistency, not provenance of underlying patch/test/review evidence; independent acceptance remains mandatory. CI #1133 was in progress when this batch began; no successful result is asserted for it or the new head. No operational changes. HOLD; CAD $0.
