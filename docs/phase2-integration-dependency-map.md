# Phase 2 integration dependency map (offline, no merge authorization)

## Snapshot
Comparison against `main`: **285 commits ahead, 0 behind, 142 changed files** (2026-11-21). This is a dependency inventory, **not** approval to cherry-pick, merge, or deploy. Source is `aca-auto-005-offline-correction-simulation`; protected PR #27 remains unmerged.

## Review slices, in dependency order

| Order | Slice | Representative files | Validation / release gate |
|---|---|---|---|
| 1 | Policy and read-only PR observer | `prSupervisionPolicy.js`, `verifiedPrLink.js`, `.github/scripts/pr-supervision-observer.js`, `pr-supervision-*.yml` | Prove no write/dispatch rights; GitHub event and repository identity binding |
| 2 | Trusted CI and independent review evidence | `verifiedCiEvidence.js`, `ciWorkflowRunBinding.js`, `signedReviewEvidence.js`, `trustedReviewerProvider.js` | Pinned GitHub App/workflow identity, head SHA, reruns; independent reviewer key custody still external |
| 3 | Correction ledger, role isolation and budget | `correctionLedger.js`, `automationLedgerService.js`, `postgresCorrectionLedger.js`, `migrations/aca_automation_*` | Immutable events, replay protection, least-privilege role and repository RLS; staging identity not provisioned |
| 4 | Offline correction coordination and advisory | `level2CorrectionCoordinator.js`, `liveCiCorrectionPacket.js`, `.github/scripts/phase2a-correction-observer.js` | Fail-closed on ambiguous evidence; no native Codex dispatch |
| 5 | Owner identity, OAuth and session boundaries | `phase2aOwnerIdentity.js`, `phase2aGitHubOAuthExchange.js`, `phase2aOwnerSession.js`, `phase2aOwnerHttp.js` | Independent OAuth/CSRF/cookie/proxy review and staging browser tests |
| 6 | Owner decisions and signed proof | `phase2aOwnerDecision*.js`, `phase2aOwnerEdgeProof.js`, `phase2aOwnerEdgeNonceStore.js`, `migrations/aca_phase2a_*` | Advisory-only intent, atomic nonce and SQL decision transitions, no operational authority |
| 7 | Private mTLS and staging adapters | `phase2aIsolatedMtlsListener.js`, `phase2aPrivateMtlsClient.js`, `phase2aPrivateOwnerHttp.js`, `phase2aStagingClients.js` | Real loopback TLS and disposable SQL CI passed; actual ingress and cert lifecycle remain unverified |
| 8 | Integration tests, workflows and runbooks | `test/phase2*.test.js`, `test/postgres-*.integration.test.js`, `.github/workflows/ci.yml`, `docs/phase2*.md` | All CI green per review slice, reproducible rollback, negative tests |

## Cross-slice trust boundaries to inspect
1. GitHub webhook/Actions event -> verified repository, PR and current head: do not trust unverified payload fields.
2. GitHub CI status -> pinned App and workflow-run provenance: reruns and pagination must fail closed.
3. Signed independent review -> advisory decision: valid signature alone does not prove reviewer independence.
4. Owner browser OAuth/session -> private signed proof: enforce fresh server-side identity, CSRF, nonce, origin and head binding.
5. Public edge -> private mTLS -> database: pin peer identity, restrict network, enforce SQL role and repository scope.
6. Advisory state -> execution: **no dispatch, merge, deploy, signing or production authorization** under any path.
7. Future product onboarding: repository allowlist, workflow pins, budget, credentials and data isolation per Alphine AI product.

## Review/rollback procedure (future, requires separate approval)
- Identify exact file dependencies for each slice, run its tests against current `main`, and check migrations for forward/backward compatibility.
- Keep every slice in draft and independently reviewable; do not automatically transplant 285 commits or treat green CI as approval.
- Use disposable PostgreSQL and localhost mTLS first. Validate rollbacks and error handling before any isolated staging activation.
- Do not merge PR #27 or deploy, create credentials, sign reviews, or start native Codex without explicit owner authorization.

## Current evidence
- CI #44949107643: Node + disposable PostgreSQL passed without forced exit.
- CI #44949334007: Node + disposable PostgreSQL passed with all six authorization flags required false.
- Temporary draft PRs #73 and #74 closed unmerged.
