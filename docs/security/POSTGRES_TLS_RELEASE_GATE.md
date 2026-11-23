# Item 14 — PostgreSQL TLS validation release gate

Status: **draft / not approved for deployment**.

## Verified by CI

- Cloud configuration explicitly requests certificate validation.
- URL SSL parameters cannot silently override cloud certificate validation.
- node-postgres effective connection parameters retain certificate validation.
- Disposable PostgreSQL SSLRequest + self-signed localhost certificate is rejected.

These tests do **not** establish compatibility with the actual Neon staging certificate chain.

## Isolated staging check (owner-reported PASS)

Use a **dedicated read-only staging role**, a connection URI from the **Alphine Phase 2 staging** Neon project, and a controlled environment that can reach its endpoint. Do not use the ACA production project or credentials.

Set `RUN_ACA_STAGING_TLS_CHECK=1` and `ACA_STAGING_TLS_DATABASE_URL` **only** in the isolated test process, not in shared application settings. Run `node --test test/db-pool-staging-tls.optin.test.js`. The test requires a Neon hostname, strips conflicting SSL query parameters, validates certificates, begins a read-only transaction, asserts encrypted and certificate-authorized client socket, reports `pg_stat_ssl` as backend-hop information, and rolls back.

Never paste database credentials into PR comments or issue logs. Record only the test result, database project identity, and sanitized TLS metadata. If the test fails, stop: do not turn off certificate verification.

## Required before merge

1. Successful exact-head CI.
2. Successful isolated staging test using a certificate-validated client.
3. Review Neon/Render connection-string compatibility and CA trust behavior.
4. Independent security review and owner approval.
5. Rollback plan and explicit deployment authorization.

A Neon provider-side query or connector transport alone is **not** proof that the ACA Node client negotiates verified TLS.

## Pre-merge execution constraint

GitHub `workflow_dispatch` workflows must be registered on the repository's default branch to be selectable for manual dispatch. Because this security change remains a **draft**, do not merge a workflow merely to enable the probe. Execute the opt-in test locally from this draft branch with a short-lived, dedicated staging role connection string loaded into the test process environment; never commit it or put it in a GitHub issue. A GitHub Actions workflow can be considered separately after default-branch approval. The connected GitHub integration cannot provision repository Actions secrets or dispatch new workflows, so these actions must not be represented as complete.

Owner supplied successful opt-in execution output for commit `8c3c780536e820761c98af7329bd1f91cffeae3e`: TLSv1.3, certificate authorized=true, backend TLS reported=false, 1 pass, 0 failures, 0 skipped. CI run 45285204969 passed. This validates the probe configuration, not every application pool path. Do not equate the Neon connector's session settings with the ACA Node client TLS behavior.

## Remaining review findings

- Shared pool currently classifies cloud URLs by substring rather than parsed hostname; remote endpoints outside the recognized patterns may fall back to plaintext. Resolve before release.
- Review URL parameter overrides and ensure startup failures do not disclose credentials.
- Confirm rotation of both previously exposed staging role credentials with dependent services coordinated; do not record secrets.
- Independent review and release approval remain pending.
