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
