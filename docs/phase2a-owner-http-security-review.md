# Phase 2A owner login-to-approval security review — 2026-11-21

**Scope:** Development-only code on PR #27, including OAuth exchange, browser
binding, the PostgreSQL session/decision stores, the unmounted HTTP handler,
and owner decision facade. This review was a targeted code inspection and
adversarial test pass, **not a full penetration test or production security
certification**.

## Fixed and verified

1. **HTTP route shadowing:** disabled/unconfigured handler no longer consumes
   unrelated routes. The route is identified before the feature gate.
2. **Rate-limit dependency exceptions:** unavailable/throwing limiter now
   rejects requests, rather than escaping the handler's security boundary.
   Test verifies no OAuth state is created after the limiter throws.
3. **Logout CSRF:** logout now requires a valid server-side session and a
   matching independent CSRF token plus the exact HTTPS Origin, as required
   by the approval POST path.
4. **OAuth callback URL canonicalization:** callback must use the exact
   relative route and query, rejects fragments and absolute URLs before
   any pending OAuth state is consumed. The pre-existing one-time
   browser-bound login cookie + state checks remain mandatory.

## Validated

- Final ACA CI run: 44933031746 (Node and PostgreSQL integration SUCCESS).
- Disposable-only tests, no live OAuth token or privileged database connection.
- No native Codex, reviewer signing, merge or deployment path was enabled.

## Outstanding before any live staging activation

- **Independent security review** of the complete live HTTP mounting and
  deployment configuration, using real HTTPS reverse-proxy and cookie behavior.
- Dedicated GitHub OAuth application registration, exact callback,
  secret handling, scopes, token expiry/revocation and GitHub's provider
  requirements; do not reuse the GitHub reviewer app.
- Atomic authenticated persistent sessions and owner decision DB clients
  under independently provisioned limited roles; no current Neon migration.
- Server-verified fresh GitHub/CI/issue and ledger handoff each decision,
  no read/write role confusion, no stale approvals.
- Distributed rate limiter; per-client/IP controls and normalized proxy
  headers; handle all unexpected dependency errors fail closed.
- CSRF and browser origin tests in a real browser, response size and
  input-body timeouts, secure callback lifecycle, no tokens in URLs/logs.
- Threat model for stolen owner sessions, compromised OAuth callback,
  invalidation on changed PR head, stale status and replay attempts.
- Explicit owner approval for any deployment and a separate authorization
  before any Codex dispatch; approval intent never means agent permission.

**Decision:** Keep handler unmounted and all live approval activation
disabled until the remaining gates are separately verified.

## Staging mount preflight — new fail-closed gate

`src/automation/phase2aOwnerMountPreflight.js` and the unmounted HTTP
handler now require a pinned HTTPS staging origin and identical expected
origin, a trusted GitHub owner/repository scope, distinct OAuth client
secret, GitHub read token and reviewer signing secret, a real server-side
OAuth/approval dependency set, and an injected trusted transport verifier.
If any required condition is absent, Phase 2A routes respond as disabled.
Even when configured, every request is denied until the transport
verifier positively confirms the trusted TLS/reverse-proxy chain.

The verifier must be implemented by the **mounting service** using a
verified private proxy identity or direct TLS socket. The handler MUST
NOT treat request-supplied `Host`, `X-Forwarded-Host` or
`X-Forwarded-Proto` as proof of HTTPS. A CI fixture verifier returning
`true` is not a deployable security implementation. There is still
**no mounted route, secure proxy implementation, OAuth secret, Neon
migration, or live owner approval service**.
