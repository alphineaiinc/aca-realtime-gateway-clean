# Stage 3 exact-SHA operational acceptance and handover

Batch 68 | 2026-11-25 Toronto | Preparation only — HOLD for protected operations.
This index supplements the master plan at 5a5c063dd8531005c7dc66d911202757eb289c6b, existing OD-25A–D decisions, protected sandbox acceptance runbook, and company dashboard SOP. It does not replace their criteria, add tasks, or authorize execution.

## Frozen evidence manifest

Repository: alphineaiinc/aca-realtime-gateway-clean.
- Original reviewer #21: 2cb07f51e5ecd7dd28fcb8cc6e6ace8eaba419b9.
- Original Manager #142: 3841fb29f804fd7d62359756ffdf4f018100ba16.
- Original sandbox #146: b162f9be2a94ecc0b3c806976b38a54d19650d5f.
- Combined disabled integration [#159](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/159): a5cf31839438bfc056b9664cba66a9cead7f1359; reviewed against base d964aba6c0692efc0d380cc2d0101a1bef0788e8. No merge or activation.
- [CI #1431](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45730740544): 481 primary passes, zero failures/cancellations, four skips; 14 admission tests included in primary count; four separate database executions passed (one in Node job, three in ledger job). Push duplicate not counted.
- [CodeQL dynamic](https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/45730735010): Actions, Python, JavaScript/TypeScript passed. [Aggregate](https://github.com/alphineaiinc/aca-realtime-gateway-clean/runs/139612036508): no new PR alerts, not blanket historical alert closure.
- [Corrective review receipt](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/159#issuecomment-7179115607), [structured summary](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/159#issuecomment-7178930890): exact head completed, no findings/unresolved findings; request 7179072194. [Batch 64 evidence](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/159#issuecomment-7179121063). Finding 4702584848 independently reassessed without residual findings; explicit historical discussion closure not evidenced. Other historical Manager threads must retain their actual status. No separate signed security disposition or operational clearance inferred.
- Prior Stage 2 is separate: no change to its runtime, pilot settings, schedule, expiry or acceptance; do not import Stage 2 observations as Stage 3 evidence.

## Workstream acceptance matrix (existing task IDs only)

| Workstream | Related permanent tasks | Required operational evidence and expected result | Stop / deny condition |
|---|---|---|---|
| S3-01 Manager/eight-agent integration | P2-14,15,26–34 | Exact immutable manifest, eight registered role identities, scoped permissions and durable task/handoff records; demonstrate no cross-role/product bypass | Role substitution, unpinned revision, missing receipt or unauthorized action |
| S3-02 Secure environment | P2-12,19–21 | Independently pinned image/harness and provenance, isolated staging DB and effective least privilege; verify nonroot, no network/secrets/sockets, resource limits and cleanup | Unknown digest, untrusted host, excess permission, residual resources or production access |
| S3-03 Independent reviewer acceptance | P2-11–13,24 | Separate authenticated reviewer, signer and verifier custody; exact-scope substantive disposition, positive/negative signature, replay, expiry and revocation tests; historical thread reconciliation | Self-certification, candidate-provided trust root, missing/revoked/expired disposition or unresolved release blocker |
| S3-04 Controlled dispatch | P2-01–03,15,17,18,25 | Separately authorized bounded read-only assignment, fresh policy, exact scope, durable reservation and actual call/usage evidence; no publication | Missing authorization, stale scope, budget uncertainty, ambiguous attempt or unauthorized capability |
| S3-05 Individual operational tests | P2-26–33 | Evidence for each role listed below, effective identity and tool permissions, independent QA/security observations | Role exceeds scope, unauthorized access, unbounded cost, missing independent observation |
| S3-06 Integrated lifecycle | P2-15,18,34 | One separately authorized nonproduction task from intake to independently reviewed draft proposal, durable handoffs and restart recovery without replay; actual publication requires separate authority | Unknown external write, self-approval, stale CI/review, main/production mutation |
| S3-07 Stop/recovery/cost/approval | P2-16,17,20,25 | Actual stop/quarantine, revocation, expiry, bounded cost and cancellation evidence; independently verified teardown and separately authorized recovery | Unknown cleanup or billing, active lease on recovery, budget breach, replay or unauthorized restart |
| S3-08 Handover | P2-04,22,23,25,34; P4-03 downstream | Current evidence index, approved capabilities/limits, owner-visible escalation, rollback and explicit acceptance record | Missing mandatory gate, unresolved independent custody or inferred approval |

Mapping is an index of dependencies, not a reassignment of permanent tasks or a claim that all downstream work belongs to Stage 3.

## Mandatory owner decision and custody checklist (reuse OD-25A–D)

- A: identify independently controlled release authority, protected reference/workflow, approved image digest and independently authenticated build provenance. No routine author bypass. Existing source SHA is not an executable artifact digest.
- B: identify independently controlled substantive reviewer, signer custodian and verifier, document effective separation and permitted role combinations before provisioning. Pin public-key fingerprint independently, define key ID/expiry/revocation and reject unknown or revoked trust. Never request or record private keys or token bytes.
- C: provide redacted effective single-repository read-only App permissions, protected runtime operator controls, independent deployment authority, isolated staging/database roles and no production access. Existing solo Hobby ownership cannot satisfy independent custody by creating same-owner accounts.
- D: only after applicable A–C and independent dispositions, separately authorize exact artifact, target, actors, time window, CAD0 ceiling, stop owner and rollback target. Confirm free-tier availability and actual cost before any protected action; no paid call or purchase implied.
- Required read-only provenance input: existing externally generated attestation bundle and artifact/subject digest; independently authenticated verifier executable/version/hash and trust-root bundle; pinned repository, source/workflow identity and revision, issuer, predicate and platform manifest. Use reviewed bounded verifier outside candidate control, no secrets or uncontrolled network, enforced timeout and independently verified teardown. Require signature, identity, transparency and digest matches; reject absent, mismatched, ambiguous or unavailable evidence. Build provenance is not substantive approval.
- Current blocker: no verified independent custodian or compliant CAD0 external service, no independently approved verifier/root or real attestation bundle, no protected deployment authority. HOLD. Do not sign, configure, deploy, provision credentials or perform acceptance under this package.

## Ordered operational execution (future separate authorizations)

1. Confirm exact frozen SHA and evidence, effective custody and protected artifact provenance; obtain explicit reviewer disposition on operational trust boundary and preserve historical thread status.
2. Authorize fixed benign isolated fixture only. Capture scope, actual permissions, expected/actual result, authenticated evidence digest, timestamps and independent witness. Exercise wrong-scope/unauthenticated/expired/replayed/revoked disposition denial, positive independently signed substantive disposition, ingress bounds, isolation negatives and five fault outcomes (ambiguous create, ambiguous removal, residual container, job cancellation, daemon unavailable). Each fault must deny progression; quarantine until independently verified cleanup. Stop on unknown state; no automatic replay or refund.
3. Separately authorize first bounded read-only role assignment with verified included budget and no publication; record actual model/tool calls, outputs and costs. If any actual cost is uncertain or nonzero under CAD0, do not execute.
4. Validate eight roles independently: Project Manager P2-26 (intake/dependencies/escalation); Solution Architect P2-27 (scoped API/data design); Backend Developer P2-28 (bounded service/DB proposal); Frontend Developer P2-29 (bounded UI/accessibility proposal); QA P2-30 (independent test evidence); Security Reviewer P2-31 (independent findings/provenance); DevOps P2-32 (CI/rollback proposal); Orchestrator P2-33 (coordination without role bypass). For each record task/role/actor IDs, exact scope, allowed/denied tool observations, actual output digest, cost, expiry, stop and independent acceptance. No role self-approves.
5. Separately authorize integrated lifecycle test; verify durable handoffs, restart/recovery, bounded correction, fresh CI/review, no ambiguous replay, draft-only publication reservation and separately approved actual publication if required. No main write, production access or deploy implied.
6. Record final evidence and explicit owner acceptance; no activation until all relevant gates satisfied. Revoke temporary access, independently confirm cleanup, preserve rollback evidence and unresolved findings. Handover must record approved capability limits and operator responsibilities.

## Evidence receipt (blank; not an acceptance record)

Workstream/task ID; exact source SHA; artifact/harness/verifier/trust-root hashes as applicable; scope and actor/role IDs; independent custody reference; approval ID and validity window; expected result; actual result and evidence link/digest; usage/cost; stop/rollback/cleanup status; reviewer disposition and timestamp; unresolved findings; owner decision. Missing evidence = pending or blocked, never pass. No secret material.

## Separate programme dependency

P3-02 notification reliability remains open. Existing phase2-item-notifications workflow detects issue edits and explicit intervention markers; governanceAlertReader provides scoped durable backlog and acknowledgement. Actual delivery failure retry, missed-event reconciliation, deduplication and owner-visible escalation remain unaccepted. Track separately from Stage 3; do not modify Stage 2 notifications, frozen integration code or add tasks. P3-03/P4 acceptance remains downstream.

## Baseline and governance

S3-01..08 provisional equal-weight engineering estimates 92/82/72/78/50/77/75/30 = 69.50% at entry. Permanent 44 tasks: 7 accepted, 24 development/partial, 3 open, 10 blocked; formal acceptance 15.91%; operational agents 0/8. No closure or progress credit solely from this index. MOAA, SDP-001/002, OLR-011/012, independent custody, frozen candidates, Stage 2 separation and CAD0 preserved. Documentation branch only; no merge, deployment, configuration, credential, signing or live dispatch authorization.
