# Phase 2 staging acceptance matrix — 2026-11-21

**Disposition: NO-GO for operational staging activation.** Offline Node and disposable PostgreSQL CI have passed in batches #81–#87; none of these runs proves real staging identity, private ingress, key custody or rollback. Protected PR #27 remains unmerged.

## Verified offline only
| Capability | Evidence | Scope |
|---|---|---|
| Owner identity, OAuth/session validation | CI #44951676145 | Fixtures and simulated requests |
| Signed proof and replay denial | CI #44952495980 | Offline proof/keyring tests |
| Cross-slice owner intent | CI #44952689678 | Offline integration |
| Staging preflight fail-closed | CI #44953098989 | Configuration-only |
| Private HTTP denial and exception safety | CI #44953799567 | Local handler |
| Private bind proposal gate | CI #44953956434 | Syntax-only, never authorizes bind |
| Real client/server mTLS handshake | CI #44954121851 | Loopback-only disposable certificates |

## Read-only infrastructure facts
- Render workspace `My Workspace`: correction staging and reviewer staging are **public web services**, Virginia, auto-deploy OFF; ACA production service in Ohio auto-deploy ON.
- No dedicated Render private owner-decision service was observed.
- Neon project `still-cell-80928176`: PostgreSQL 17, `staging` branch ready; branch protection OFF. Least-privilege roles and repository RLS **not verified**.

## Mandatory operational acceptance gates
All must have separately collected, independently reviewed, staging-specific evidence before any activation decision:
1. Isolated database roles, grants and login identities.
2. Repository RLS verified with real least-privilege staging roles.
3. Reversible migrations applied and rollback tested in isolated staging.
4. GitHub App, workflow and current-head provenance verified against staged events.
5. Independent reviewer operation and separation of duties.
6. Signing-key custody, revocation and rotation demonstrated.
7. Real browser OAuth/cookie/CSRF/rate limiting and proxy trust demonstrated.
8. Dedicated private service with authenticated network isolation.
9. Real edge-to-private mTLS with SAN, CA, pinning and certificate rotation.
10. Atomic nonce replay protection in isolated staging under concurrency.
11. Adversarial end-to-end rollback and incident drill.

`src/automation/phase2StagingAcceptance.js` is an **offline evidence-shape checklist**, not an external evidence verifier. Its positive outcome is named `offline_evidence_complete` and **never** grants operational activation, deployment, signing, merge, or agent dispatch. The provided URLs and claimed independent review must still be authenticated and verified by an external approval process.

## Authorization separation
No development CI result or checked box permits merging PR #27, creating/deploying Render services, provisioning credentials, reviewer signing or native Codex dispatch. Request explicit scoped owner approval for each operational action.
