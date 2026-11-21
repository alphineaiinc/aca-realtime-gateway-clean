# Phase 2 isolated staging preparation — approval-gated runbook

**Status:** Preparation only. No services, credentials, certificates, database migrations or GitHub applications are provisioned by this document. Protected PR #27 is not approved for merge. All six execution flags remain false.

## Architecture and boundaries
- Browser GitHub OAuth edge: a **dedicated** staging HTTPS service, isolated from ACA production. It holds browser session/CSRF state and a limited GitHub owner OAuth configuration, **not** the owner decision database writer or reviewer signing keys.
- Private owner-decision service: dedicated same-region Render private service with mutually authenticated TLS, authenticated signed owner-intent envelope, atomic nonce store, and least-privilege staging-only database writer. It does not accept browser cookies or untrusted forwarding headers.
- Independent reviewer: separate operator/service and key custody; cannot share the owner OAuth client secret, read token, edge proof signing key, or DB writer identity.
- Isolated Neon: staging-only project and restricted login roles. Never use ACA production Neon. Require authenticated `session_user` verification and repository RLS evidence.
- GitHub: pin repository ID, workflow ID, current PR head, rerun attempt, app identity, and complete pagination. Never derive authorization from CI text or reviewer prose.

## Preflight gates (all must be evidenced before activation)
| Gate | Evidence required | Current status |
|---|---|---|
| Repository and change scope | Partitioned reviewable diff, dependency and rollback plan for PR #27 | OPEN |
| Reviewer independence | Separate service/operator, public verification key, custody, rotation and revocation drill | OPEN |
| Database isolation | Staging connection identity, scoped RLS and read/write separation, rollback migration | OPEN |
| GitHub provenance | Real staging events, app permissions, rerun and stale-head rejection | OPEN |
| OAuth/browser | Exact callback, CSRF, cookie, logout, browser origin, distributed rate limiting, token revocation | OPEN |
| Render mTLS | Same-region private DNS, real TLS SAN, client/server certificate pinning, renewal/revocation, ingress routing | OPEN |
| End-to-end safety | Adversarial replay/stale-head/role-confusion tests, rollback and incident drill | OPEN |
| Owner authorization | Explicit scope-limited approval for any staging deploy; independent approvals for signing, merge or dispatch | NOT GRANTED |

## Safe future rehearsal (only after staging-specific approval)
1. Inventory target isolated staging Render services, Neon project/branch and GitHub App configuration **without changing them**. Confirm private network availability and compatible port binding.
2. Review exact environment variables and secret ownership. Enter secrets only through approved secret stores, never PRs, logs or chat. Use independent owner OAuth, reviewer and database identities.
3. Provision least-privilege staging roles and apply reversible migrations only after separate authorization; verify actual `session_user`, `current_user`, RLS, denied writes and cross-repository access.
4. Verify staging-only GitHub events, CI provenance and independent reviewer key rotation before enabling owner endpoints.
5. Test real browser login, PKCE/state binding, cookie/CSRF, rate limits, expiry, replay and malicious origin/proxy headers.
6. Prove actual edge-to-private mTLS and signed proof, nonce single-use and key/certificate rotation. Confirm private service cannot be reached publicly.
7. Run fail-closed end-to-end and rollback drills. Disable feature, revoke temporary secrets and preserve an audit trail.
8. Produce go/no-go evidence and request **separate** authorization for any next operational step.

## Immediate offline-only next actions
- Add and run tests for six-flag preflight denials and owner HTTP disabled behavior.
- Check CI in temporary draft PR and close it unmerged.
- Perform a read-only inventory of existing isolated staging resources before proposing a specific, approval-scoped activation plan.

**No green CI or checklist completion automatically grants native Codex, merge, reviewer signing, production or deployment permission.**
