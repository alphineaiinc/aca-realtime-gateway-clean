# Phase 2A persistent owner intent — staging-only design

The implementation is an intentionally **unwired** transaction adapter:
`src/automation/phase2aOwnerDecisionStore.js`. Its two operations,
`createPendingDecision` and `persistOwnerIntent`, require a caller-created
PostgreSQL client and a freshly authenticated real owner + current handoff.
Neither function starts an agent, signs, merges or deploys.

`migrations/aca_phase2a_owner_decisions_staging.sql` defines:
- An exact SHA/CI/owner/attempt-bound request with a maximum 30-minute TTL
- A one-time `pending` → `approved_intent` or `rejected` transition
- Append-only `created` and decision audit events
- Forced row-level security on both tables, **without any active policy or grants**

## Intentional activation blocker

The migration is not yet applied to the live Neon staging database.
The new tables **deny all runtime access by default**. Applying a migration,
assigning a narrowly scoped service role, adding RLS policies, verifying
cross-role behavior, and enabling any live endpoint are separate reviewed
actions. The existing `aca_phase2a_runtime_reader` must remain READ ONLY
and must never receive INSERT or UPDATE on either new table.

The database service role must bind to an independently authenticated GitHub
actor, repository, exact handoff, and fresh CI/head before it can use
`persistOwnerIntent`. The adapter cannot perform this authentication itself.
It uses a conditional serializable transaction; conflicting/repeated attempts
must return a blocked state. Future integration needs genuine PostgreSQL
concurrency tests and database-granted role-scoped RLS tests before activation.

## Non-authorizations

An `approved_intent` row is **not** Codex dispatch permission.
No new GitHub comment-triggered API, code-execution path, or reviewer signing.
No approval result can be translated into permission to merge or deploy.
Proof-only staging evidence never substitutes for real issue eligibility.

## Validation

The new unit tests cover creation, duplicate prevention, rejection, replay,
wrong owner, expired/stale head, and missing storage. They use a fake
transaction client; they **do not** prove PostgreSQL race safety by themselves.
Full GitHub CI must pass before the PR can advance toward review.

## Verified in isolated GitHub Actions PostgreSQL

`migrations/aca_phase2a_owner_decisions_role_policy.sql` provisions an
inert NOLOGIN writer group with repository-scoped forced RLS policies.
Membership is NOT assigned to any live account by the migration.
The existing staging runtime reader is never granted owner-decision writes.

`test/postgres-owner-decision.integration.test.js` uses disposable CI login
roles to test actual PostgreSQL row-level security and transactions, including
two simultaneous conflicting owner choices, replay blocking, append-only event
audit enforcement, cross-repository denial, and inability of the ordinary
reader to access the approval journal. It runs only when
`ACA_TEST_DATABASE_URL` exists; the CI workflow injects a local disposable
PostgreSQL 16 service, never Neon.

## Owner identity (not activated)

`src/automation/phase2aOwnerIdentity.js` defines an *unwired* read-only
GitHub identity check using `GET https://api.github.com/user` with a
separate per-user OAuth credential, verified against the pinned numeric owner
ID and login. It rejects a shared read-only service PAT and all unverified
responses. Its returned `verified:true` is only an identity finding; it
does not grant execution permission.

A live authenticated OAuth login/session broker, CSRF protection, token
lifecycle, secure cookie/session storage, and validation that the API request
came from that session are **not built**. Do not accept owner IDs, approval
comments, or the proof-only packet as authentication. Do not configure a
live approval endpoint before those features are independently reviewed.

## Owner browser session boundary — development only

`src/automation/phase2aOwnerSession.js` is an **unwired** backend session
protocol. The login flow generates a 256-bit random state, opaque browser
binding handle and PKCE S256 challenge. Only a short-lived atomic server-side
store holds the code verifier and pending state. The callback consumes its
pending state **once**, checks a five-minute expiry, then relies on the
server-side GitHub code exchange and authenticated `/user` identity check.
After success, the backend issues a fresh independent session cookie
(`__Host-aca_owner`, `Secure`, `HttpOnly`, `SameSite=Strict`, path
`/`), a distinct CSRF token, and a maximum 15-minute session.

Every approval POST must pass exact HTTPS Origin, the HttpOnly session
cookie, independent CSRF header, server-side current session, and expiry
checks before its validated owner ID is forwarded to the owner decision
store. Logout revokes that session. The module has no routes, listeners,
GitHub client registration, token exchange implementation, or dispatch code.
Its tests use an injected in-memory **fixture** store only.

**Before enabling live OAuth:**
- Register and verify an exact GitHub callback URL on a separate user-login
  integration; the existing reviewer app signing flow is not required
- Implement a trusted login-binding browser cookie/flow that cannot be
  supplied or replaced by a cross-site attacker. The opaque login handle
  must never be trusted merely because it appears in a callback query
- Supply a persistent atomic consume-once store shared by every instance;
  encrypt sensitive data at rest, expire records and rotate sessions
- Use a server-only code-to-token exchange pinned to exact callback URL,
  client identity and PKCE verifier; never send access tokens to the browser
- Keep owner login tokens separate from the GitHub read-only service token
- Add rate limits, request size limits, audit/monitoring and secure headers
- Retest against the actual configured redirect/origin, multi-instance
  behavior, failed token exchange and concurrent login replay
- Independently revalidate live ACA CI, current PR head, issue eligibility,
  and ledger before persisting any owner intent

An authenticated **session** is still only an identity proof; it never
authorizes code execution, PR merge, signing or production deployment.

## Durable OAuth state and browser binding (development, not activated)

`src/automation/phase2aOwnerSession.js` no longer accepts a callback-supplied
`loginId`. On login start it returns a short-lived, secure, HttpOnly,
SameSite=Lax `__Host-aca_login` cookie. Callback handling reads that cookie
and consumes a server-side state record exactly once; the cookie is cleared
after successful login. The real approval session remains a separate
SameSite=Strict, Secure, HttpOnly `__Host-aca_owner` cookie with CSRF.

`migrations/aca_phase2a_owner_oauth_store_staging.sql` and
`src/automation/phase2aPostgresOAuthStore.js` provide an unwired,
persistent PostgreSQL backing store. A dedicated NOLOGIN group has forced
RLS and only SELECT/INSERT/DELETE; no live login membership or credentials
are provisioned. OAuth login states use an atomic `DELETE RETURNING`
to make concurrent callback attempts single-use. Stored PKCE verifiers
use AES-256-GCM with a separately provided 32-byte key and digest-bound
associated data. Sessions store only SHA-256 hashes of opaque random
session/CSRF tokens; logout deletes the session row. Both tables enforce
maximum login/session TTLs.

The new `test/postgres-owner-oauth.integration.test.js` exercises a
disposable PostgreSQL instance with two independent connections to test
concurrent login consumption, encrypted verifier storage, wrong encryption
key rejection, duplicate session creation, logout, and role isolation.
No live Neon migration, approval route or OAuth App has been enabled.

**Remaining before activation:** independently verify the actual GitHub
OAuth product's PKCE support and code exchange semantics; build the
registered exact redirect/callback, server-side OAuth exchange, persistent
owner session broker and authenticated approval endpoint; validate CSRF,
origin/referrer rules, rate limits, credential handling, failover and
key rotation. A development-only store and isolated fixture tests are
not proof of a live authenticated approval flow.

## GitHub OAuth exchange and owner-intent facade (development only)

GitHub's current documentation confirms the authorization-code flow with PKCE
`S256` and `state`. `src/automation/phase2aGitHubOAuthExchange.js` builds
an authorization URL pinned to the trusted HTTPS staging callback and
implements a server-side POST token exchange. The confidential client secret
is never returned to the browser. The code is completely **unwired**: no OAuth
App is registered, no client credentials are configured, and no HTTP route
uses these functions. References:
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app

`src/automation/phase2aOwnerApprovalFacade.js` combines authenticated
session/CSRF validation with a freshly injected trusted handoff and the
existing transactional owner-intent journal. The owner identity comes from
the server-side session, not submitted JSON. Even an approved intent has
every Codex/merge/signing/deploy/production authorization set to false.
Tests use injected fake GitHub and database clients and **do not prove a
live owner-facing approval endpoint**.

The remaining activation gates are a registered dedicated OAuth application
with exact callback and server-side secrets, real browser lifecycle and
code exchange, securely provisioned Neon session/journal roles and policies,
rate limiting, monitoring, and security review of both the login route and
the handoff freshness mechanism. No native Codex work may be started on
the basis of the owner-intent record alone.

## HTTP owner adapter (unmounted, development only)

`src/automation/phase2aOwnerHttp.js` defines an opt-in, **not mounted**
request handler for the four paths `/phase2a/oauth/start`,
`/phase2a/oauth/callback`, `/phase2a/owner/decision`, and
`/phase2a/owner/logout`. It requires an explicit isolated-staging
flag, an independently configured rate limiter, and injected
login/session storage, OAuth exchange, identity verifier, trusted
approval-packet loader, fresh GitHub/ledger handoff, and decision store.
Absent configuration fails closed with HTTP 404. The callback must carry
the short-lived browser-bound login cookie; the decision body accepts
only an exact request ID and an approve/reject choice. Real owner
identity and handoff evidence never come from browser JSON.

**Do not mount or enable this handler yet.** No GitHub OAuth application,
live client secrets, registered callback, external owner interface,
persistent session role, or approval-writing database connection is
provisioned. The unit tests use fake dependencies and disposable
in-process request/response streams. Prior to any live activation,
perform an independent security audit of exact routes, login CSRF,
callback exchange, rate limiting, abuse controls, authorization and
owner authentication, and verify that production cannot reach this
staging-only component.
