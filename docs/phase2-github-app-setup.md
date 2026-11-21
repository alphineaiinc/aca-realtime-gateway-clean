# Alphine AI Security Reviewer — GitHub App registration and handoff

## Current status
The current GitHub integration can read repository resources but does **not** offer GitHub App registration, app private-key generation, or installation administration. An owner must complete the GitHub UI registration and select repository-only installation access. This document is not proof the App exists or is installed.

## Owner registration (single personal account is sufficient)
1. In GitHub, open **Settings > Developer settings > GitHub Apps > New GitHub App**. Choose a unique name such as `Alphine AI Security Reviewer`.
2. Set the App to be installed only on the `alphineaiinc/aca-realtime-gateway-clean` repository (selected repositories), not every repository.
3. Repository permissions: **Metadata: Read**, **Contents: Read**, **Pull requests: Read**. Grant no Actions, Administration, Secrets, Deployments, or repository write permissions to this evidence-reading identity.
4. Select only necessary events; webhook can be disabled for a polling-only staging service. Use an independently audited review engine for a security verdict; the GitHub App identity alone is not an independent reviewer.
5. Record the resulting numeric App ID, Installation ID and bot user ID. Generate the App RSA private key in GitHub. Store it securely and separately from the review-verdict Ed25519 key. Never commit or paste either key into issues, PRs or chat.
6. Independent review must be produced by a separate trusted review process which has actually inspected the exact PR head. A read-only GitHub App cannot submit GitHub PR approvals. Do not equate an App installation, a CI pass, or its own self-assertion with an independent review.

## Staging service integration
- `ACA_REVIEW_GITHUB_APP_ID`: GitHub numeric App ID.
- `ACA_REVIEW_GITHUB_INSTALLATION_ID`: installation ID with this one repository.
- `ACA_REVIEW_GITHUB_APP_PRIVATE_KEY`: GitHub App RSA PEM in protected Render secret storage.
- `ACA_REVIEW_REPOSITORY_ID`: exact GitHub repository ID (currently `1080201236`).
- `ACA_REVIEWER_ID`: independently trusted **review author bot/account ID**, distinct from the PR author. Do not substitute the GitHub App ID.
- `ACA_REVIEW_API_TOKEN`: independently generated high-entropy bearer secret for the reviewer endpoint.
- `ACA_REVIEW_PRIVATE_KEY`: separately generated Ed25519 reviewer verdict signing PEM.
- Trusted supervisor: pin the corresponding Ed25519 **public** key and reviewer identity outside PR-controlled code.

Staging reviewer currently uses a mutable draft PR branch as its source. **Do not provision any private keys or reviewer secrets to that service** until an independent audit and immutable revision pin are in place. No automatic merge, ACA deployment or native Codex dispatch.

## Live acceptance
- Confirm installation token is restricted to the one repository and requested read-only permissions.
- Confirm GitHub App JWT scope, read-only GitHub fetch, the actual independent review event and exact head binding.
- Verify signed verdict with pinned key. Wrong signer, stale SHA, dismissed review, cross-repo scope and service outage fail closed.
- Capture Render staging logs and Neon repository isolation evidence, CI results and manual owner sign-off.

## Registered App identifiers (supplied by owner)
- GitHub App ID: `5858755`.
- GitHub Installation ID: `184252224`.
- Target repository ID: `1080201236` (`alphineaiinc/aca-realtime-gateway-clean`).
- These non-secret values were added to the **isolated** Render reviewer service only. Render environment changes cause a new staging-only deploy even with automatic deployment disabled. **No private keys or reviewer bearer token have been provisioned.**
- App registration and installation were reported by the owner; current connected GitHub installation listing is scoped to the connector's own App and cannot independently attest to App `5858755`'s selected repositories or permissions. Verify after an isolated App token is securely configured.
- Architectural hold point: this GitHub App has read-only Pull requests permission, so it can fetch approvals but cannot submit them. The current reviewer server's `matchingReview` expects an `APPROVED` review submitted by a separately authorized reviewer identity, not the same App ID or the PR author. Do not assign the App ID as `ACA_REVIEWER_ID` or manufacture an approval. Provision a truly independent review-producing identity/process and review immutable reviewer code before activating Ed25519 signing.
