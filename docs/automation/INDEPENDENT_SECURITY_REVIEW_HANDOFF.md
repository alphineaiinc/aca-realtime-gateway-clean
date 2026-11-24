# Independent Security Review Handoff — Phase 2 Agent Manager

Prepared from the currently verified draft pull-request heads. This document is an evidence index for an independent reviewer, not a security approval or activation authorization.

## Exact revisions and CI evidence

| PR | Purpose | Exact head | Draft state | CI evidence |
|---|---|---|---|---|
| #21 | Reviewer supervision and trusted disposition | `9c7222473bd7243e1eb98e3d71d19fd2bd6b4f00` | Open, draft | ACA CI #1035 / [45465109963](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45465109963); PR Supervision Event Observer #574 / [45465110108](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45465110108); Reviewer staging HTTP smoke #44 / [45465110229](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45465110229) — all successful |
| #142 | Eight-agent manager, durable queue and SEC-09 reconciliation | `7f9e0bcc0ca3650d00b533f24afca754f8b70f31` | Open, draft | ACA CI #1075 / [45471444110](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45471444110) — successful; Node tests and isolated PostgreSQL integration steps successful |
| #146 | Protected sandbox harness | `2b928b91df7cb3ae68bc9ebc5353fbae34d90337` | Open, draft | ACA CI #1043 / [45465837929](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45465837929) — successful |

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
