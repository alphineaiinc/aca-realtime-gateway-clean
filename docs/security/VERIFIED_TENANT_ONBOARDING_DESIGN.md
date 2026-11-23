# Verified tenant onboarding — Item 14 design and acceptance gates

Status: **DRAFT / NOT IMPLEMENTED / NOT APPROVED FOR RELEASE**  
Scope: ACA public tenant signup and login; coordinated with draft PRs #123 and #127 and security issue #24.

## Threat and current behavior

On the default branch, `POST /public/signup` accepts an arbitrary email and business name, inserts tenant and business records, and returns an authenticated tenant JWT and API key. No proof of email possession or authority to create or control that tenant is established. Email-only login was also capable of minting a tenant JWT. PR #123 blocks email-only login; PR #127 temporarily blocks public signup entirely. **Do not merge PR #127 as a functional onboarding implementation.**

## Proposed trust boundary

1. **Enrollment initiation:** Validate and normalize email and business data; apply abuse controls and neutral responses. No tenant JWT, API key, active tenant or privileged business binding may be created from an unverified request.
2. **Ownership proof:** Issue a short-lived, single-use, cryptographically random verification challenge; store only a hash and expiry server-side. Deliver proof through an approved provider. Bind challenge to normalized email, intended business and purpose. Never log tokens.
3. **Verified completion:** Atomically consume the challenge with replay protection. Resolve existing tenant identities and business associations under unique constraints. Explicitly authorize creation versus joining an existing tenant. A verified email alone must **not** grant control of an existing business or tenant.
4. **Transactional persistence:** Create tenant and business linkage in one transaction with rollback on failure and unconditional client release in `finally`. Define idempotency and duplicate-request behavior; do not silently default business type to restaurant.
5. **Credentials:** Only after successful verified completion and authorization may the service issue a scoped, short-lived JWT. If API keys are necessary, use cryptographically secure entropy, securely store their verifier/hash, and avoid replayable secrets in logs or unprotected responses. Define rotation and revocation.
6. **Login:** Use an approved proof-of-identity mechanism; never mint a JWT based on an email lookup alone. Bind tenant claims to an explicit, authorized tenant membership.
7. **Database and transport:** Use certificate-validated TLS for cloud PostgreSQL and approved development-only local settings. Validate migration compatibility against the canonical `master_tenants` schema; do not assume nonexistent tenant tables.
8. **Compatibility:** Inventory ACA signup/login consumers, tenant provisioning and business cluster assignments. Stage behind a controlled, explicitly approved rollout. Existing customers and telephone workflows must remain unaffected.

## Required negative tests

- Unverified or forged email cannot create tenant/business records, JWTs or API keys.
- Missing signing secret, missing verification provider, expired/replayed/tampered challenge, duplicate completion and cross-tenant claims fail closed.
- DB error between tenant and business writes rolls back both and releases the connection.
- Concurrent enrollments cannot create duplicate memberships or claim existing tenants.
- API key and verification token are not logged or returned before authorized completion.
- Non-restaurant businesses retain the explicitly assigned cluster; no speech-derived or default restaurant assignment.
- Staging integration tests exercise real HTTP requests, real PostgreSQL constraints and provider-failure simulation with disposable data.

## Review / rollout gates

- Security design and data model reviewed independently; owner approves the identity provider and signup contract before activation.
- Exact-head Node CI, CodeQL alert reconciliation and independent security review completed.
- Staging integration, ACA compatibility, rollback and operational monitoring evidenced.
- Keep all related PRs draft; **no merge, deployment, production changes, secret activation or agent dispatch without explicit authorization**.

This document specifies a proposed design and acceptance criteria only. No provider, migration or runtime verified onboarding implementation is included.
