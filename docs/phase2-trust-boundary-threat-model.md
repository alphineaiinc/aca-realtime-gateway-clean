# Phase 2 trust-boundary threat model — offline review

**Scope:** automated development supervisor, owner advisory flow and reusable per-repository product boundaries. **No live service or credential is enabled.** This is an engineering checklist, not an independent security certification.

## Assets and trust anchors
- Repository/PR/current head SHA; verified GitHub App identity and Actions workflow/run provenance.
- Independent reviewer verdict signing key and key ID, revocation/rotation registry.
- Owner OAuth identity, session cookie, CSRF secret and one-time signed decision proof.
- PostgreSQL correction ledger, decision and nonce tables, least-privilege role identities and repository-scoped RLS.
- Pinned private mTLS client/server certificates and CA; production authorization flags (all six must remain false).

## Threats, required controls and negative tests

| Boundary | Threat | Required denial / verification | Status |
|---|---|---|---|
| GitHub event -> supervisor | Forged issue association, wrong repository, stale PR head | Authenticated GitHub lookup and exact repo/PR/head binding; deny ambiguous links | Offline tests; real event review pending |
| CI -> supervisor | Spoofed check, workflow mismatch, rerun confusion, pagination gaps | Pinned App/workflow/run/check suite and current SHA; reject missing pages | Offline tests; staging permissions pending |
| Reviewer -> supervisor | Forged verdict, compromised signing key, self-review | Ed25519 binding, reviewer independence, rotation/revocation | Signature tests; independent key custody pending |
| Ledger -> coordinator | Replay, cross-repository access, tampered history, budget reset | Append-only events, nonce/sequence, RLS and scoped authenticated DB role | Disposable SQL tests; staged role identity pending |
| Owner browser -> approval | Session theft, login CSRF, callback tampering, stale authorization | Exact OAuth redirect/origin, server session, CSRF, expiration, current head binding | Offline tests; real browser/proxy pending |
| Public edge -> private service | Forged proxy headers, TLS downgrade, wrong peer, cert rotation gap | Direct socket mTLS, pinned fingerprint, private network restriction, fail closed | Loopback TLS tests; actual ingress pending |
| Private service -> SQL | Unauthorized state transition, replayed proof, role escalation | Signed audience/owner/request binding, atomic nonce, restricted SQL role | Disposable SQL tests; staged role pending |
| Advisory -> execution | Intent interpreted as permission to dispatch, merge, sign or deploy | Six explicit false flags at every boundary; no native Codex/deploy wiring | Unit/integration tests; staging adversarial test pending |
| Cross-product onboarding | ACA repo policy reused unsafely for another product | Explicit per-repository allowlist, pinned workflow/App IDs, independent budgets and credentials | Design review pending |

## Staging test matrix — approval required before execution
1. **Positive:** valid signed independent review + verified current CI + scoped ledger -> advisory-only owner request.
2. **Negative:** stale SHA, wrong repository, forged issue link, wrong App/workflow, incomplete pagination, CI rerun mismatch -> blocked.
3. **Negative:** expired/replayed/modified owner proof, missing nonce store, wrong owner/audience -> blocked; no SQL approval event.
4. **Negative:** no client cert, wrong pinned cert, forwarded-header spoof, invalid CA, expired/rotated cert -> blocked.
5. **Negative:** stolen session, missing/wrong CSRF, wrong Origin, OAuth state replay, changed PR head -> blocked.
6. **Negative:** wrong database role, cross-repository read/write, immutable ledger UPDATE/DELETE, exhausted retry budget -> blocked.
7. **Recovery:** SQL/network/reviewer timeout, process restart and certificate rotation -> fail closed, no duplicate events.
8. **Safety invariant:** for every outcome assert `agentDispatchAuthorized=false`, `dispatched=false`, `mergeAuthorized=false`, `deployAuthorized=false`, `signingAuthorized=false`, `productionAuthorization=false`.
9. **Rollback:** disable feature flag and verify endpoints unavailable, revoke test credentials and restore staging image; never touch production.

## Acceptance rule
Code-only and disposable CI success is necessary but insufficient. Phase 2 operational readiness requires independently verified staging topology, identities and negative tests plus explicit owner sign-off. No merge/deployment/native Codex/signing permission is implied.
