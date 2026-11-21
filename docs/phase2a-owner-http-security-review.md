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

## Pinned proxy mutual TLS verifier — development only

`src/automation/phase2aMtlsTransport.js` now provides a pure
`createMtlsTransportVerifier({clientFingerprint256})` function. It
requires `TLSSocket.encrypted === true`, `TLSSocket.authorized === true`,
no TLS authorization error, a nonempty authenticated peer certificate
and a precisely matching, pinned SHA-256 certificate fingerprint.
It reads the peer certificate directly from the TLS socket, not
`X-Forwarded-Proto`, `Host`, `req.secure`, or
`X-Forwarded-Client-Cert`. The match is constant-time and
misconfiguration fails closed.

**Important infrastructure constraint:** This verifier only works if the
proxy establishes **mutually authenticated TLS all the way to the Node
approval listener**. The Node HTTPS listener must be configured with
`requestCert:true`, `rejectUnauthorized:true`, and a separate trusted
client CA and pinned proxy certificate. A standard HTTPS-facing proxy
that forwards plaintext HTTP cannot satisfy this contract. In
particular, the normal Render HTTPS-to-HTTP pattern has NOT been
verified as compatible. Do not bypass the gate by setting
`verifyTrustedTransport:()=>true` in staging. This module is unmounted,
does not create listeners, and has no production exposure.

Before activation, deploy an **isolated** mTLS-capable edge or choose
a separately reviewed authenticated proxy assertion design with
distributed replay protection. Test actual TLS socket identity with
legitimate and attacker-controlled client certificates, rotation,
revocation and browser HTTPS routing. None of those live tests
are represented by these unit fixtures.

## Isolated HTTPS/mTLS listener and real handshake proof

`src/automation/phase2aIsolatedMtlsListener.js` provides a separate,
unmounted HTTPS server factory. It requires a server key/certificate,
trusted client CA, pinned client SHA-256 fingerprint and explicit request
handler. The listener insists on `requestCert:true` and
`rejectUnauthorized:true`, and cannot listen on a public interface:
only `127.0.0.1` or `::1` are permitted until separately reviewed.
Importing or constructing the factory starts no server.

`test/phase2a-isolated-mtls-listener.test.js` generates disposable local
certificates with OpenSSL and tests real client/server TLS negotiation.
Correct authenticated pinned proxy certificate succeeds; other
CA-trusted but unpinned certificates receive 403; absent or untrusted
client certificates fail the TLS handshake. Forged forwarding headers
do not change the outcome. All temporary test keys stay inside the
disposable CI runner and are not committed.

This is an isolated, **loopback-only** integration component, not a
production-ready proxy or an owner approval service. The real Render
ingress still has no compatible authenticated proxy-to-Node mTLS channel.
Do not deploy or mount this component on the current Render web service,
expose the listener publicly, or bypass the mTLS check. Live activation
still requires a secure network design, certificate issuance/rotation,
staging-only deployment approval, and browser integration testing.
