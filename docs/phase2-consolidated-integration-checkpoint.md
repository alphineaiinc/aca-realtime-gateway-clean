# Phase 2 consolidated offline integration checkpoint — 2026-11-21

## Purpose and evidence scope
This is a development-branch acceptance inventory, **not** permission to merge, deploy, sign, provision credentials or dispatch an agent. Protected PR #27 remains unmerged. No staging or production service has been activated.

## Latest batched CI evidence
| Batch | Draft PR | ACA CI | Node | Disposable PostgreSQL | PR disposition |
|---|---|---|---|---|---|
| Owner identity, OAuth session denial and origin spoofing | #81 | 44951676145 | passed | passed | closed unmerged |
| Signed owner proof, decision binding, replay and injected authority | #82 | 44952495980 | passed | passed | closed unmerged |

Earlier offline integration evidence is tracked in `docs/phase2-readiness-gate-2026-11-21.md`, `docs/phase2-integration-dependency-map.md` and the PR #27 progress log. Passing CI proves only the tested development fixtures, **not** operational security.

## Cross-slice offline acceptance
1. **Observer and CI provenance:** pin repository identity, current PR head, trusted workflow and App identity, rerun attempt and complete pagination; deny ambiguous or stale evidence.
2. **Independent review:** verify signature, exact head and reviewer independence; external reviewer operation, key custody, rotation and revocation remain unverified.
3. **Correction ledger:** preserve append-only audit, attempt budget, rollback, atomic replay claims, role separation and repository RLS. Staging login-role identity remains unverified.
4. **Coordinator:** only issue bounded advisory corrections. Untrusted reviewer notes and CI summaries must never become instructions.
5. **Owner browser:** validate exact GitHub owner ID/login, one-time OAuth state/PKCE, secure cookies, exact HTTPS Origin, CSRF, expiration, replay and fail-closed transport/rate limiting. Browser and reverse-proxy staging behavior remains unverified.
6. **Owner proof:** exact issuer/audience/owner/repository/request/decision, Ed25519 signature, short expiry and atomic nonce claim. Never treat owner intent as dispatch authorization.
7. **Private transport:** pin mTLS server/client identities and private host; deny injected headers, extra payload authority, untrusted responses. Loopback handshake tests are not proof of Render ingress compatibility.
8. **Workflow/rollback:** full Node and disposable PostgreSQL CI; confirm temporary validation PRs are closed **without merging** and preserve rollback/incident procedures.

## Mandatory six-flag invariant
Every advisory/denied result crossing the automation, owner, signed-proof and private-service boundaries must keep `agentDispatchAuthorized`, `dispatched`, `mergeAuthorized`, `deployAuthorized`, `signingAuthorized`, and `productionAuthorization` explicitly `false`. A passing offline test is not a grant of authority.

## Operational blockers — not satisfied by CI
- Independent reviewer deployment, independent signing-key custody and revocation procedures.
- Authenticated least-privilege staging database identities, real repository isolation and migrations on a **disposable or isolated staging** database only.
- Real GitHub App/workflow provenance against staged events and permission scopes.
- Isolated Render private-network topology, verified mTLS ingress and certificate lifecycle; real browser OAuth/CSRF/cookie/rate-limiter and proxy testing.
- Adversarial end-to-end staging rehearsal, rollback and incident recovery.
- Explicit owner authorization **separately** for any merge, staging deployment, reviewer signing, or native Codex dispatch.

## Next gate
Run consolidated CI for this documentation checkpoint; then perform a targeted cross-slice dependency audit and produce a final go/no-go checklist. Do not label Phase 2 production-ready until operational blockers have independent evidence and explicit approval.
