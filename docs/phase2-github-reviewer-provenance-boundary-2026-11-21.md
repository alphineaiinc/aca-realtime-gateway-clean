# Phase 2 GitHub provenance and independent reviewer boundary — 2026-11-21

## Code review
- `verifiedCiEvidence.js` requires exact check name, current head SHA, pinned GitHub App ID, workflow ID and complete check-run count. Caller must fetch authenticated GitHub API data.
- `ciWorkflowRunBinding.js` binds check suites to separately fetched Actions workflow runs, rejecting ambiguous duplicate suites.
- `signedReviewEvidence.js` verifies an Ed25519 signature pinned by the caller against exact repository/PR/head/reviewer and status. **Its returned `independent:true` is not independently verified separation of duties**; signature proves key possession, not who controlled the key.
- `trustedReviewerProvider.js` pins an HTTPS host and requires injected authenticated transport; redirect denial, TLS peer authentication and response limits are transport obligations, not verified by this wrapper.

## Added non-authorizing offline gate
`phase2ReviewerProvenanceGate.js` requires three independent *claimed* inputs: signature-verification result, GitHub provenance at the same SHA, and reviewer/key-custody attestation at the same repository and SHA. It rejects absent/mismatched inputs and never sets operational authorization. Even when all claims are present, `externallyAuthenticated=false`, `operationalActivationAuthorized=false`, and all six action authorization flags remain false. This is defense-in-depth, **not** external verification of the supplied claims.

## Operational verification still required
- Obtain current repository ID, PR head and check suites directly from authenticated GitHub API; pin workflow ID and GitHub App ID from trusted configuration, not PR payload.
- Independently verify reviewer's organization/account, non-overlapping ownership, signing-key custody, revocation and rotation.
- Validate actual transport TLS, redirects, timeout and service identity.
- Re-run on head changes and workflow reruns; reject stale signatures or incomplete pagination.
- Record attestation in an independent trust store, not a PR comment or unsigned document.

**Disposition:** Offline checks only. No GitHub reviewer signing, credentials, deployment, merge or dispatch authorized.
