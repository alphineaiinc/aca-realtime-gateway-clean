# ACA ChatGPT / Codex plugin package

PR #158 owns the marketplace package. It is independent of carrier PR #157.

## Current implementation

- Read-only MCP capability: `aca_get_business_profile`.
- The MCP router is disabled by default; no production endpoint is deployed or authorized.
- OAuth bearer verification requires RS256, configured issuer, exact MCP resource audience, expiry, subject, signed integer `tenant_id`, and `aca:profile:read`.
- Profile reads use verified ACA main schema `public.master_tenants(id integer,business_name,preferred_lang,region)`.
- No request-count, customer PII, call-history, write, payment or provisioning tools are exposed.
- MCP ingress has bounded IP rate limiting.
- Protected-resource metadata advertises only the supported `aca:profile:read` scope.
- The root portable `plugin.json` contains listing draft metadata and five positive / three negative reviewer test-case drafts. These cases are not represented as live-tested.

## Submission status

The package is a technical draft, not ready for public submission.

Outstanding external gates:
- Stable production MCP HTTPS endpoint and matching root `mcp.json`.
- Verified OAuth issuer configuration and trusted mapping from authenticated principal to `master_tenants.id`.
- Public, complete privacy policy and terms-of-service pages.
- Confirmed customer support URL and publisher identity.
- Primary square listing icon.
- Execute all eight reviewer cases against a real connected test tenant.
- Record reviewer-accessible video and set `review.demo_recording_url`.
- Dedicated reviewer account and sample data entered only in the secure submission portal.
- Complete domain verification, connect/scan the MCP server, clear portal findings, submit for review and receive approval.

Current website evidence:
- Website: https://www.alphineai.com
- Contact: https://www.alphineai.com/contact
- Privacy: https://www.alphineai.com/privacy currently says full privacy documentation will be added soon; not acceptable as final review evidence.
- Terms: no verified public URL located.

Official references:
- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/deploy/submission-errors
- https://developers.openai.com/plugins/deploy/app-review

Do not create placeholder endpoints, invent OAuth claims, expose customer records, provision credentials, deploy, submit or publish without separate authorization.

## Governance

CAP-001. CAD $0 additional spending. No production changes, merges, credential provisioning, database migrations or public submission. Preserve PR #157.
