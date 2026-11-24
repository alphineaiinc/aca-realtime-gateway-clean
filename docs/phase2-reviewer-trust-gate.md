# Phase 2 independent reviewer trust-gate assessment

Date: 2026-11-21
Scope: reviewer code on PR #21 and isolated staging service only.

## Verified facts
- GitHub CI (Node and PostgreSQL) and the PR observer succeeded for `8913433d3eae750899b389176bc5dcef05a8ca45`.
- Created branch `aca-phase2-reviewer-audit-candidate-8913433d` pointing at that **specific tested commit**. This is a candidate reference, not a completed independent audit, immutable signed artifact, or authorization to deploy.
- Staging Render service is live at an earlier code revision. Its credentials are intentionally absent. Production ACA is untouched.
- GitHub App ID `5858755`, installation ID `184252224`, repository ID `1080201236` are non-secret metadata. The new App's installation access has not been authenticated with a token from its private key.

## Findings requiring resolution before credentials or signed reviews
1. **Critical: reviewer independence not established.** The read-only GitHub App authenticates API evidence but does not submit a GitHub code review or perform semantic security analysis. Do not mark independent=true merely because the App is installed. `matchingReview` requires a genuine `APPROVED` submission from a distinct trusted reviewer ID. PR #21 has zero submitted reviews and is draft.
2. **Critical: trusted-code boundary.** The staging service source is a branch containing its own reviewer and signing code. CI green does not establish a separately audited signing trust root. Before supplying GitHub App PEM or Ed25519 private key: independently review the reviewer implementation, transfer/pin the accepted code revision into a protected release boundary, prohibit unreviewed deployments, and independently pin the public key in supervisor configuration.
3. **High: API/review timeline.** Revalidate both PR head and current review state before signing. Existing code handles updated head and later dismissed review through a second fetch. Continue to test GitHub pagination/races, review author identity, stale approval and revoked credentials.
4. **High: public service and secret custody.** `/review` is internet accessible and guarded by a bearer token. Secrets require protected runtime storage, rotation, and observation without logging material. Review should have no mutation or deployment authority.
5. **High: live evidence unverified.** Unit and mock HTTP tests do not establish GitHub App installation token retrieval, signed live verdict delivery, or a live reviewer process independent of developer agents.
6. **Blocking UX constraint:** PR #21 is intentionally draft. The staging reviewer correctly rejects draft PRs, so testing a `passed` verdict using PR #21 is not an acceptable shortcut. Use a separate reviewed, non-draft staging fixture PR when that is approved.

## Completed controls
- Read-only GitHub installation token scope for one repository.
- Bearer-authenticated HTTPS transport on caller; fail-closed endpoint on signer.
- Offline Ed25519 signature validation with repository/PR/head/reviewer binding.
- Latest-second PR head and review recheck (including dismissal).
- Adversarial mock HTTP scenarios: tampered key, stale SHA, self-review, wrong repo, API outage.
- Repository-scoped Neon RLS with dedicated real LOGIN identities and regression CI.

## Required external owner controls
- An independent review-producing service/person not controlled by untrusted PR code (not the existing App alone).
- Independently audited and pinned reviewer runtime image/commit, separate owner-controlled deployment boundary.
- Protected GitHub App PEM plus independently generated Ed25519 private key and endpoint bearer token. These are **not** to be put in the repo, a PR, chat, or the existing application production environment.
- Repository-specific App installation token obtained with actual PEM and permission review.
- Documented secret rotation and final manual owner approval before any merge/deploy.

## Authorization status
**HOLD: NOT READY TO SIGN OR MERGE.** No secrets applied, no live independent signed review, no production changes, no native Codex dispatch.


## SEC-07/08 updated acceptance gate
Approval-only envelopes are not substantive dispositions. The observer requires a separately trusted evidence digest and a fresh challenge bound to repository, issue, PR, reviewer and exact head. The digest provider must independently obtain and canonicalize the reviewed evidence; it must not echo the signer's claim. Before enabling delivery, independently pin the accepted signer artifact and public key outside PR-controlled configuration. Maintain an owner-controlled active key inventory, deny revoked keys, fail closed on unavailable revocation state, and rotate by separately approving the replacement artifact/key pair and retiring the old key before resuming. Verify stale challenges, wrong digest, wrong revision, revoked keys and rotation rollback denial. No signing or credential provisioning is authorized by this document.
