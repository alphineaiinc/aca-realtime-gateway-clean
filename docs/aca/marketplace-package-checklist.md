# Marketplace package preparation

Not a submission-ready package. Include the approved plugin manifest using the current official schema, verified HTTPS MCP resource URL, verified publisher identity, support/privacy/terms URLs, icons, positive and negative test cases and demo recording. Exclude secrets, tokens, customer data and local configuration. Validate the package in the official publishing UI before submission.

## Current implemented capability boundary

- The MCP router is disabled by default and must remain unmounted until a separately authorized production release.
- The authenticated profile tool accepts only RS256 tokens from the configured issuer, exact resource audience, unexpired tokens and the `aca:profile:read` scope.
- The issuer must be the trusted authority that issues the signed `tenant_id` claim. Caller-supplied tenant identifiers are never accepted.
- Profile reads use the verified existing `public.master_tenants(id,business_name,preferred_lang,region)` schema.
- Request-count tools are intentionally not exposed: no verified customer-request table exists in the connected ACA main schema. Do not infer a table name or create one as part of marketplace packaging.
- The connected main database has no `aca_business_identities` or `aca_customer_requests` tables. Staging schema acceptance and production identity-provider mapping remain separate release gates.

SDK installation and the committed lockfile are validated without mutating the reviewed revision. OAuth issuer provisioning, tenant-claim issuance, live HTTPS interoperability and official marketplace acceptance remain release gates. No publication authorized.
