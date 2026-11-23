# Item 14 — PostgreSQL TLS validation release gate

Status: **draft / not approved for deployment**.

## Verified by CI

- Cloud configuration explicitly requests certificate validation.
- URL SSL parameters cannot silently override cloud certificate validation.
- node-postgres effective connection parameters retain certificate validation.
- Disposable PostgreSQL SSLRequest + self-signed localhost certificate is rejected.

These tests do **not** establish compatibility with the actual Neon staging certificate chain.

## Isolated staging check (not yet executed)

Use a **dedicated read-only staging role**, a connection URI from the **Alphine Phase 2 staging** Neon project, and a controlled environment that can reach its endpoint. Do not use the ACA production project or credentials.

Set `RUN_ACA_STAGING_TLS_CHECK=1` and `ACA_STAGING_TLS_DATABASE_URL` **only** in the isolated test process, not in shared application settings. Run `node --test test/db-pool-staging-tls.optin.test.js`. The test requires a Neon hostname, strips conflicting SSL query parameters, validates certificates, begins a read-only transaction, checks `pg_stat_ssl` and rolls back.

Never paste database credentials into PR comments or issue logs. Record only the test result, database project identity, and sanitized TLS metadata. If the test fails, stop: do not turn off certificate verification.

## Required before merge

1. Successful exact-head CI.
2. Successful isolated staging test using a certificate-validated client.
3. Review Neon/Render connection-string compatibility and CA trust behavior.
4. Independent security review and owner approval.
5. Rollback plan and explicit deployment authorization.

A Neon provider-side query or connector transport alone is **not** proof that the ACA Node client negotiates verified TLS.
