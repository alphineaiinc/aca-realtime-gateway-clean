# ACA ChatGPT / Codex plugin submission checklist

Status: **technical package draft; not submission-ready**. Current implementation is read-only and exposes one authenticated business-profile tool. Do not submit, deploy, publish, or provision credentials until the external gates below are completed and separately authorized.

## Implemented technical boundary

- MCP router remains disabled by default and must not be mounted in production without separate authorization.
- Authenticated profile tool accepts RS256 tokens only from the configured trusted issuer, exact resource audience, unexpired tokens and `aca:profile:read` scope.
- Trusted issuer must derive signed `tenant_id` from verified tenant membership. Caller-supplied tenant IDs are never accepted.
- Profile reads use actual `public.master_tenants(id integer,business_name,preferred_lang,region)` schema.
- Request-count and customer-record tools are not exposed because no verified request/customer table exists in the connected ACA main schema.
- MCP ingress has bounded IP rate limiting.
- Protected-resource metadata advertises only the implemented `aca:profile:read` scope.
- Marketplace workflow installs and audits the committed lockfile without mutating the reviewed revision.

## Portable plugin package

Official current reference: https://developers.openai.com/plugins/build/plugins

- [x] Root `plugin.json` portable Agent Plugins manifest drafted.
- [ ] Root `mcp.json` with exactly one `streamable-http` MCP server and stable public HTTPS URL. Not created because no production endpoint is verified or authorized.
- [ ] Primary square listing icon, supported PNG/JPEG/WebP/SVG, at least 48x48 and no more than 5 MiB.
- [ ] Complete package ZIP with every referenced asset.
- [ ] Upload and metadata validation in the OpenAI Developer Platform.
- [ ] No `.app.json` app references or lifecycle hooks in the public submission ZIP.

## Listing metadata

For MCP review the official portal requires all four HTTPS listing URLs. See https://developers.openai.com/plugins/deploy/submission.

| Field | Current evidence |
|---|---|
| `displayName`, `shortDescription`, `longDescription` | Drafted in `plugin.json` |
| `developerName` | Drafted as Alphine AI; portal publisher identity still needs verification |
| `category` and capabilities | Drafted |
| `websiteURL` | `https://www.alphineai.com` |
| `supportURL` | `https://www.alphineai.com/contact` (contact page; confirm support adequacy) |
| `privacyPolicyURL` | Not accepted as final: published page says full privacy documentation is forthcoming |
| `termsOfServiceURL` | No verified public URL found; must be published and verified |
| Logo | No approved package asset verified yet |
| Publisher/domain identity | Must be completed in the submission portal |

## MCP connection and authentication

Official references:
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/deploy/submission-errors
- https://developers.openai.com/plugins/deploy/app-review

- [ ] Production HTTPS MCP endpoint and stable origin.
- [ ] OAuth discovery or explicit authorization/token endpoint configuration in `mcp.json`.
- [ ] OAuth client registration and callback URI validated in portal; never put client secret in package.
- [ ] Trusted issuer maps authenticated principal to the integer `master_tenants.id` and issues the signed tenant claim.
- [ ] Complete exact-host domain challenge at `/.well-known/openai-apps-challenge` when portal requests it.
- [ ] Connect MCP and complete automated tool scan; resolve all blocking findings.
- [ ] Verify no unsupported tool scopes or unimplemented tools are advertised.

## Reviewer materials

The `plugin.json` includes exactly five positive and three negative test-case drafts. They have not been executed against a production reviewer endpoint. Official requirements: five positive cases, three negative cases, accessible video walkthrough, release notes, and reviewer credentials entered separately in the secure portal form.

- [x] Five positive case drafts.
- [x] Three negative case drafts.
- [x] Release notes draft.
- [ ] Execute all eight cases against the real connected test account; capture evidence.
- [ ] Record and publish reviewer-accessible video walkthrough; add `review.demo_recording_url`.
- [ ] Create dedicated reviewer tenant/account with sample data and no MFA/email/SMS challenge; enter credentials only in secure portal form, never in ZIP.
- [ ] Complete policy attestations and submit the selected draft for review.
- [ ] Receive approval; publication remains a separate explicit action.

## Website/legal content

- Website: `https://www.alphineai.com` is reachable.
- Contact: `https://www.alphineai.com/contact` is reachable.
- Privacy: `https://www.alphineai.com/privacy` currently states full privacy documentation will be added soon; this is not adequate final privacy evidence.
- Terms: no verified terms-of-service URL found.
- Product page describes ACA as actively being built and validated; listing claims must not imply a generally available production product.

## Guardrails

- No production deployment, credential provisioning, public submission, publication, database migration or merge is authorized by this checklist.
- Do not use placeholder URLs, invented publisher verification, fake reviewer credentials or test-only endpoints as production evidence.
- CAD $0 additional spending. Preserve carrier PR #157 independently.
