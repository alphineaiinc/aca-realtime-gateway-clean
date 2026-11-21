# Phase 2A positive owner-approval handoff — remaining gates

**Status:** isolated **proof-only** validator implemented and tested with injected fixtures; **not** a real live positive owner-approval handoff, and not authorized for production.

## Verified earlier

- Read-only GitHub and Neon runtime authentication passed on the isolated Render staging service.
- A real failed ACA CI run on temporary PR #44 produced the expected
  `verification_required` denial (HTTP decision 409).
- Test PR #44 and its issue #43 are now closed; deliberately failing code
  has never been merged. There is no eligible live test issue.

## Why a positive live test cannot be obtained merely by adding labels

The protected GitHub queue workflow maintains `aca:auto/active` only when
an allowlisted issue has been **manually assigned to Codex**. Any
unassigned test issue with that label will be reconciled and the active
label removed by the safe-queue runner.

The correction observer correctly requires all three labels:
`aca:auto/docs-test`, `aca:auto/eligible`, `aca:auto/active`.
Applying a temporary fake `active` label, changing label policy, or
impersonating a Codex assignment would defeat the authorization boundary.

**Do not** assign Codex solely to satisfy a test. Native Codex tasks require
separate owner approval and must not run automatically.

## Implemented proof-only validator (not deployed as an active route)

`src/automation/phase2aStagingPositiveProof.js` enforces a distinct staging proof label (`aca:phase2a/staging-proof-only`), an expiry of no more than 30 minutes, authenticated GitHub CI and exact head/issue-link checks, read-only initialized zero-attempt ledger history, and current-head revalidation. It rejects any issue carrying actual `aca:auto/active` or `aca:auto/manual-dispatch-requested` labels. Even the successful state is `staging_proof_only_ready`, with `productionAuthorization:false`, `ownerApprovalRequested:false`, `agentDispatchAuthorized:false`, and all merge/deploy/signing/dispatch flags false. It has no HTTP route or startup execution and cannot grant actual correction approval.

The successful path and adversarial cases are covered in `test/phase2a-staging-positive-proof.test.js`; only mocked/injected GitHub and database clients are used. Do not mistake those unit-test results for a live persisted-ledger demonstration.

## Future authorized live proof

Create an *explicitly isolated, staging-only proof contract* whose
authorization is not inferred from `aca:auto/active` or an assignment to
Codex. It should independently bind:

1. Repository ID, non-draft same-repository PR number and exact head SHA.
2. One GitHub-resolved closing issue link with a limited, purpose-built
   staging test label distinct from any real dispatch eligibility label.
3. An authenticated, current failed ACA CI run and its head SHA.
4. A single initializer-scoped staging ledger row bound to that evidence,
   created via a dedicated write role only after an owner-approved test
   initialization (never through the read-only runtime role).
5. An advisory-only output with explicit
   `agentDispatchAuthorized:false`, `mergeAuthorized:false`, and
   `deployAuthorized:false`. No native Codex, signing, or production access.

The staging-only proof must not be accepted as real correction
authorization in the production policy and must have explicit expiry
and cleanup.

Until this proof contract is reviewed, *the live positive owner-approval
state remains unverified*.

## Repeat failure limitation

The ledger stores the previous failure fingerprint, but no verified
current failure fingerprint is available from the ACA CI run. After any
recorded correction, read-only history conservatively reports an
unknown/repeated failure as an escalation rather than presenting
`unchangedFailureCount:0`. A future enhancement may enable a second
correction only after an independently authenticated CI failure
fingerprint comparison. Until then, manual escalation is required.
