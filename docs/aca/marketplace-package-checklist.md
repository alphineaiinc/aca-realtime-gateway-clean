# ACA ChatGPT marketplace submission checklist

Status: technical package work is progressing; **not submission-ready**. Do not submit or publish until all external identity, endpoint, legal, reviewer and approval gates below are satisfied.

## Implemented technical boundary

- MCP router is disabled by default and must remain unmounted until separately authorized production release.
- Authenticated profile tool accepts RS256 tokens only from the configured trusted issuer, exact resource audience, unexpired tokens and `aca:profile:read` scope.
- The trusted issuer must issue the signed `tenant_id` claim from its verified tenant membership mapping. Caller-supplied tenant identifiers are never accepted.
- Profile reads use the actual `public.master_tenants(id,business_name,preferred_lang,region)` schema.
- Request-count tools are intentionally not exposed: the connected ACA main schema has no verified customer-request table. Do not infer a table name or create one during marketplace packaging.
- The connected main database has no `aca_business_identities` or `aca_customer_requests` tables. Live issuer configuration and tenant-claim mapping remain release gates.
- MCP ingress has bounded IP rate limiting. The marketplace acceptance workflow installs and audits the committed lockfile without modifying the reviewed revision.

## Official public-directory package requirements

Reviewed against the current OpenAI plugin submission documentation (2026-11-26):
https://developers.openai.com/plugins/deploy/submission
https://developers.openai.com/plugins/deploy/submission-errors
https://developers.openai.com/plugins/deploy/app-review

### Portable package files

- [ ] Root portable plugin manifest (current schema) with the MCP server declaration.
- [ ] Root `mcp.json` with the stable public HTTPS MCP endpoint and supported OAuth configuration. No secrets or client secret in package.
- [ ] Include every file referenced by manifest paths.
- [ ] Primary listing logo/icon; `logo` and `composerIcon` paths for Codex-compatible packages. Square image, supported PNG/JPEG/WebP/SVG, at least 48x48, no more than 5 MiB.
- [ ] Semantic package version and publisher metadata.
- [ ] Automated upload/package validation completed with no blocking findings.

### Listing metadata

- [ ] `displayName` (maximum 30 characters).
- [ ] `shortDescription` (maximum 30 characters).
- [ ] `longDescription` (maximum 4,000 characters).
- [ ] `developerName` (maximum 80 characters) matching the verified developer identity.
- [ ] Supported directory `category`.
- [ ] Product website URL (HTTPS).
- [ ] Customer support URL (HTTPS).
- [ ] Privacy policy URL (HTTPS).
- [ ] Terms of service URL (HTTPS).
- [ ] Up to three optional starter prompts, each no more than 128 characters.
- [ ] Up to 20 optional capability labels, each no more than 120 characters.

### MCP connection and review

- [ ] Stable, publicly accessible production HTTPS MCP endpoint.
- [ ] Complete OAuth configuration, supported client registration, authorization and token endpoints/scopes.
- [ ] Complete publisher/domain verification challenge in the OpenAI portal.
- [ ] Connect MCP server and complete automated tool scan; resolve all blocking findings.
- [ ] Exactly five positive test cases. Each includes description, prompt, expected tool names and observable expected behavior.
- [ ] Exactly three negative test cases. Each explains why the plugin must not act and its safe refusal/clarification/fallback.
- [ ] Reviewer-accessible video walkthrough URL.
- [ ] Release notes for the submitted version.
- [ ] Dedicated reviewer account and sample data entered separately in the secure review-details form, not in the ZIP. Reviewer login must not require MFA, SMS/email codes or private-network access.
- [ ] Complete policy attestations and submit the selected draft for review.
- [ ] Receive approval; publication is a separate explicit action.

## Current evidence and external blockers

| Requirement | Current status |
|---|---|
| Exact-revision source/lockfile audit | Implemented |
| Tenant profile schema compatibility | Implemented against existing table; issuer mapping unverified |
| Request count | Disabled until a real supported request schema exists |
| OAuth issuer and production token claims | Not provisioned or verified |
| Production HTTPS MCP endpoint | Not deployed; production changes not authorized |
| Root portable manifest and `mcp.json` | Not yet created; endpoint/configuration values are not verified |
| Public listing website | `https://www.alphineai.com` exists |
| Support URL | Contact page exists; dedicated support page needs confirmation |
| Privacy URL | `https://www.alphineai.com/privacy` exists but its published content says full privacy documentation is still forthcoming; not acceptable as final review evidence yet |
| Terms of service URL | Not located; must be published and verified |
| Verified OpenAI publisher identity | Must be completed by the organization in the OpenAI Platform Dashboard |
| Five positive / three negative cases | Not yet authored in final package and run against a real reviewer endpoint |
| Reviewer walkthrough | Not recorded |
| Secure reviewer account | Not provisioned |
| Official scan/review/approval | Not started |

## Guardrails

- No production deployment, credential provisioning, public submission, publication, database migration or merge is authorized by this checklist.
- Never use placeholder URLs, invented publisher verification, fake reviewer credentials or test-only endpoints as production evidence.
- CAD $0 additional spending. Preserve carrier PR #157 independently.
