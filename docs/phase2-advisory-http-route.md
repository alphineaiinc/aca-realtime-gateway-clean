# Phase 2 — advisory triage HTTP route

The isolated reviewer source now implements `POST /triage` alongside the existing `POST /review`. Both require the configured bearer token, a valid repository/PR/head scope and a pinned repository identity.

`/triage` uses the **read-only** GitHub App installation token provider to fetch repo information, the PR, complete file patches (only up to 100 files), and the current PR again. Its response is deliberately unsigned and has `independent:false`. It returns HTTP 409 for incomplete/changed evidence and HTTP 503 for missing credentials. A clean scan is only `manual_review_required`. It cannot approve or sign.

`/review` is unchanged in purpose and requires separate `ACA_REVIEWER_ID` and Ed25519 `ACA_REVIEW_PRIVATE_KEY` plus validated independent review evidence. Do not repurpose triage or CI success as a signed review.

## Rollout hold

The code exists only in the draft PR branch until a separately authorized staging rollout. The staging service is still based on unreviewed mutable PR source. **Do not add GitHub App PEM, bearer secrets, or signing credentials to it** before an independently audited, immutably pinned reviewer runtime is established. Even read-only GitHub App PEM grants access as the App and should not be exposed to untrusted code.

Recommended order: independently review and pin the reviewer runtime; move it behind a separate protected deployment boundary; configure scoped read-only App credentials via owner-managed secret store; smoke test `/triage`; establish an actual independent review producer; then activate and test signing. No ACA production deployments or PR #21 merge without explicit owner approval.
