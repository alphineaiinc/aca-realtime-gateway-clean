# Alphine AI — MASTER_PROJECT_COMPLETION_PLAN

Baseline v1.0 | 2026-11-24 | SDP-001 | Scope frozen for delivery planning by owner instruction; draft branch only, not merged or operational authorization.

## Source and counting rules
Original parent #4 defines four phases. #14/#16 Phase 1; #20/#23 supervision/correction; #118 sections A–G and SDP-001; #22 reviewer; #24 security. #118 F/G eight roles and Manager belong to Phase 2, not an additional phase. #118 H explicitly tracked roadmap: founder recipient, Gmail transport, recurring reports and long-term vision remain deferred pending separate scope approval; do not erase them. ACA product backlog (#9/#10/#11 and other product-only items) is separate; security findings already in #24 retain disposition obligations here. No double counting of alert IDs, role foundations, CI, or cross-phase dependencies. Historical checklist entries consolidated into permanent IDs below; more detailed evidence remains in source trackers. C = criterion complete at stated scope, D = implementation/partial evidence (not closed), O = open, B = blocked by external evidence or specific owner authorization. All D/O/B count outstanding. No claim of independent security clearance. Counts are unweighted work packages, not effort-weighted percent. Evidence snapshot retrieved in conversation; not a full audit of every PR's code or every comment. Unknown is not complete.

## Baseline accounting
- P1: 3/4 closed; 1 implementation evidence, 0 open, 0 blocked.
- P2: 2/34 closed; 22 implementation evidence, 2 open, 8 blocked.
- P3: 1/3 closed; 0 implementation evidence, 2 open, 0 blocked.
- P4: 0/3 closed; 0 implementation evidence, 1 open, 2 blocked.
- Total 6/44 closed (13.6%); 38 outstanding, including 23 with implementation/partial evidence. Not an estimate of code written.
- Remaining effort estimate 67–144 engineering hours, sum of row ranges; planning assumption, not measured or promised; conditional defects, approval waiting, independent reviewer availability and cost/credential constraints may extend it. Estimates include verification of existing work, not rebuilding foundations.

## Permanent checklist
| ID | State | Deliverable | Evidence / source | Dependencies | Remaining hours | Exit evidence |
|---|---|---|---|---|---|---|
| P1-01 | C | Dispatch feasibility and accepted manual fallback | #14/#15 | None | 0 | Document supported interfaces; no false dispatch claim |
| P1-02 | C | Guarded eligibility, single lock, audit and issue event workflow | #15 merged d5bbdf5 | P1-01 | 0 | Policy and workflow tested |
| P1-03 | C | Owner-approved merge and disposable smoke acceptance | #4, #18/#19 closed; #15 merged | P1-02 | 0 | Transitions, revocation, cancellation and cleanup demonstrated |
| P1-04 | D | Stale active lock recovery | #15 exact head 424283714fab91996d02105a3b574055f77b3159; CI 44845417284 success; merged d5bbdf5304d5cd0f0fdd73e02a2c4991d609a8df; main source/test blobs identical | P1-03 | 1–2 | Existing implementation supersedes #17 code objective; confirm independent review and API-error regression evidence or document disposition |
| P2-01 | D | Pure supervision policy: exact-head CI/review, explicit states, fail closed | #20/#21 64aed92 CI 45473844726 | P1-03 | 1–2 | Independent review and authorized integration |
| P2-02 | D | Read-only PR observer, reconciliation, idempotent provenance and least privilege | #20/#21 observer prior run 45473844701 | P2-01 | 2–4 | Live paginated reads, stale/lost events, SHA and effective permissions |
| P2-03 | D | Bounded correction and offline simulation | #20/#23; prior offline foundation | P2-01 | 2–4 | Max two corrections, no dispatch, stale/ambiguous/replay/outage negatives; exact evidence and review |
| P2-04 | D | SDP-001 and source of truth | #126 6886f94; #121 242da16 draft | P1-03 | 1–2 | Owner-reviewed procedure and approved integration |
| P2-05 | C | Isolated TTS development-stage security validation | #118 item 13; #117 355cefa CI 45112869457; isolated scan 45112869419 | None | 0 | Exact-head development evidence only; no default alert closure |
| P2-06 | C | Historical security inventory and triage methodology | #24 export 80 unique alerts, seven cohorts | None | 0 | Historical inventory recorded; live closure separate |
| P2-07 | B | Current CodeQL inventory, settings and default alert #5 disposition | #24/#118; #116/#117 | P2-06 | 2–4 | Owner supplies read-only export/settings evidence; compare SARIF and default branch |
| P2-08 | D | Rate-limit cohort including all applicable routes and shared-store behavior | #125 46b534a; historical 67 | P2-07 | 4–8 | Per-alert disposition; distributed and abuse tests; no blanket clearance |
| P2-09 | D | Logging, randomness, path, URL, XSS cohort disposition | #117/#122 004ae42/#123 9f2a6c5/#124 3561024 | P2-07 | 4–8 | Per-alert source/sink assessment and real integration; default closure after approved release |
| P2-10 | O | Confirmed authentication/security concerns and dependency/SMTP acceptance | #24 email-only login/JWT fallback; #115 2a47fb3 | P2-07 | 4–8 | Risk assessment, scoped fixes where required, negative auth/TLS tests, audit; coordinate ACA product backlog without duplication |
| P2-11 | D | Reviewer runtime source, substantive disposition, replay/key checks | #22/#21 64aed92 CI 45473844726 | P2-01 | 1–3 | Independent semantic review of auth/JWT/App, replay, parsing, tenant/secret boundaries |
| P2-12 | B | Protected reviewer artifact, signer custody and operational App permissions | #22 explicit hold | P2-11 | 3–6 | Independent key pin, protected immutable artifact, least privilege, rotation/revocation; owner authorization |
| P2-13 | B | Reviewer staging acceptance and genuine independent findings | #22/#118 B | P2-12 | 2–4 | Positive/negative signature, triage never approves, webhook/idempotency/rate limits and substantive PR findings |
| P2-14 | D | Manager registry, role contracts, permissions and product isolation | #142 65ae91f CI 45490929492 | P2-01 | 1–3 | Role-specific identities and effective boundaries; no bypass |
| P2-15 | D | Durable queue, leases, retries, cancellation, recovery and policy-bound continuation | #142 65ae91f; CI 45489357218 isolated PostgreSQL step passed | P2-14 | 1–3 | Lost/stale/duplicate events and crash recovery; integration acceptance |
| P2-16 | D | Governance alerts, emergency stop, quarantine and recovery | #142 offline foundation; #118 G | P2-14 | 1–3 | Owner visibility, prohibited-action denial, recovery and no self-approval |
| P2-17 | D | Budget, audit, provider reservation and escalation | #142 offline foundation; #118 C/G | P2-14 | 1–3 | Bounded calls/cost/iterations, audit IDs, redaction and retention; actual operational acceptance |
| P2-18 | D | Patch/test/review request validation and publication reservation/reconciliation | #142 65ae91f CI 45490929492; 3022b81 CI 45489357218 | P2-14 | 1–3 | Exact scope, distinct bindings and independent observation; no live admission implied |
| P2-19 | D | Protected sandbox source and five authenticated fault outcomes | #146 fe977b3 CI 45487768540 | P2-18 | 1–3 | Independent review; operational proof separate |
| P2-20 | B | Operational sandbox provenance, teardown and fault acceptance | #146/#118; source CI only | P2-19 | 3–6 | Protected runner/image/workflow, all five fault outcomes, quarantine and no residual resources |
| P2-21 | B | Staging isolation, database least privilege and authorized schema acceptance | #118 D; disposable CI not operational | P2-14,P2-12 | 3–6 | Effective roles/write denial, separation from production, authorized migration/rollback |
| P2-22 | D | Operator runbook, observability, retention and trusted dependency/runtime baseline | #118 D; #142 runbook foundation | P2-14 | 2–4 | Review current runbook, health, alerts, logs, Node/actions pins and rollback |
| P2-23 | O | Exact-SHA dependency map and integrated release candidate | #118 C/D; inventory below | P1-04,P2-01..22 | 2–4 | Reconcile superseded drafts; no duplicate merges; all required CI and scans |
| P2-24 | B | Independent final security review and disposition | #22/#24/#118; all three principal PR CI green only | P2-23 | 3–6 | Independent reviewer records exact SHA, findings and clearance; fix release blockers and re-review |
| P2-25 | B | Owner-authorized integration, release and restricted Manager activation | #118 D/G; no authorization yet | P2-24,P2-20,P2-21 | 2–4 | Explicit merge/deploy/settings approvals; health and stop/rollback; no live activation before gates |
| P2-26 | D | Project Manager: intake, dependencies, progress/escalation | #118 F; #142 offline role foundation | P2-14,P2-25 | 1–2 | Role-specific exact-SHA tests, identities, tool permissions and operational demonstration |
| P2-27 | D | Solution Architect: architecture/API/data design | #118 F; #142 offline role foundation | P2-14,P2-25 | 1–2 | Role-specific exact-SHA tests, identities, tool permissions and operational demonstration |
| P2-28 | D | Backend Developer: scoped service/DB changes | #118 F; #142 offline role foundation | P2-14,P2-25 | 1–2 | Role-specific exact-SHA tests, identities, tool permissions and operational demonstration |
| P2-29 | D | Frontend Developer: UI/accessibility/regression | #118 F; #142 offline role foundation | P2-14,P2-25 | 1–2 | Role-specific exact-SHA tests, identities, tool permissions and operational demonstration |
| P2-30 | D | QA & Testing: independent tests and evidence | #118 F; #142 offline role foundation | P2-14,P2-25 | 1–2 | Role-specific exact-SHA tests, identities, tool permissions and operational demonstration |
| P2-31 | D | Security Reviewer: independent findings and provenance | #118 F; #142 offline role foundation | P2-14,P2-25 | 1–2 | Role-specific exact-SHA tests, identities, tool permissions and operational demonstration |
| P2-32 | D | DevOps: CI/ops and rollback proposals | #118 F; #142 offline role foundation | P2-14,P2-25 | 1–2 | Role-specific exact-SHA tests, identities, tool permissions and operational demonstration |
| P2-33 | D | Orchestrator: coordinate seven roles with isolation and bounds | #118 F; #142 offline role foundation | P2-14,P2-25 | 1–2 | Role-specific exact-SHA tests, identities, tool permissions and operational demonstration |
| P2-34 | B | Integrated eight-role engineering workflow and separation of duties | #118 F/G; 0/8 active | P2-26..33 | 3–6 | Disposable task from requirement to draft PR, independent security and QA, no self-approval or unauthorized actions |
| P3-01 | C | Owner-visible mobile notification proof | #118 E; issue comment 7090423512; #121 5e8be38 | P1-03 | 0 | One successful iPhone banner; not general delivery guarantee |
| P3-02 | O | Actionable notification reliability, retry and escalation | #4 Phase 3/#118 D | P3-01,P2-16 | 2–4 | Failure/retry, deduplication, backlog and owner-visible escalation |
| P3-03 | O | Mobile review/approval end-to-end | #4 Phase 3; Level 1 prior #3/#6 | P2-25,P3-02 | 1–3 | Owner can inspect, approve/reject exact candidate; no implicit merge |
| P4-01 | O | Integrated adversarial and full-path nonproduction acceptance | #4 Phase 4/#118 C | P2-34,P3-03 | 3–6 | Lost/reordered events, stale CI/review, spoofing, forks, prompt injection, outage, partial writes, retry cap, rollback |
| P4-02 | B | Effective branch rules and required checks/review enforcement | #4 ruleset 27702081 historical; #118 A | P2-07,P2-24 | 1–3 | Read-only current verification; changes only with approval |
| P4-03 | B | Final owner UAT, operational acceptance and ACA handover | #4/#118 D/F | P4-01,P4-02 | 1–3 | All mandatory criteria evidenced; owner accepts; eight agents operational; no unauthorized production work |

## Exact revision inventory (retrieved 2026-11-24)
PR #15 merged d5bbdf5304d5cd0f0fdd73e02a2c4991d609a8df; #17 bb135f1f676a819adcd1b4674996f058c64403fe; #21 64aed92779d5cedb75c2d967bdaef7d6b8af60fe; #115 2a47fb399b63aebfdc7f5d2bc37afe834623e4f4; #117 355cefaaf4792ed1ac5382e38163e7b9ee0b9c66; #121 242da162a89db95bd950d64f32a69e930fc33327; #122 004ae42c63b9a7ef235d18df15a5377ec2817709; #123 9f2a6c5904394ad745043fa58d0dc56384c088df; #124 35610244314b70bde24491a2a0e42a49a3a01e1d; #125 46b534a2031b82dd50a496ae6eb30dbc8cbcd34f; #126 6886f947f75501097a5cdf56838f8c59b0b43898 (parent of this plan); #142 65ae91f1dd17d1af34b131ebe7a681b69d3aede6; #146 fe977b3b64ad3540cf9f5568b29da7f847520138. All except #15 are draft/unmerged at snapshot. Historical CI must not be transferred to changed heads. #142 run 45490929492 confirmed success; #21 and #146 prior exact-head runs above preserved. Other current heads require evidence where not recorded.

## Fixed delivery batches and critical path
1. B01: P1-04, P2-01..04, P2-07..10, P2-14..19, P2-22: reconcile existing evidence; fix only demonstrated blockers; obtain read-only CodeQL export and settings evidence. Parallel security cohorts and foundation checks. No repeat of accepted CI.
2. B02: P2-11..13, P2-20..21, P2-23..24: review candidate exact revisions and operational trust requirements. P2-23 dependency range is readiness of prerequisite components; operational checks needing merged/deployed code may be staged after explicit authorization, and must pass before live activation. Independent reviewer may review source before operational credentials; do not introduce circular gate. P2-24 final acceptance requires operational evidence, not just source review. Correct genuine release blockers in one bounded batch; after two failed attempts escalate.
3. B03: P2-25: owner-approved integration and restricted Manager staging release after trust gates; staging setup may be separately authorized for acceptance, not live agent activation. No implied authorization.
4. B04: P2-26..34 and P3-02..03: verify individual roles, then integrated disposable task and mobile approval. No unsupported native dispatch or uncontrolled spend.
5. B05: P4-01..03: full-path/adversarial tests, branch enforcement and final UAT/handover. Close parent #4 and #118 only when acceptance evidence and explicit owner closure exist.

## Fixed definition of done / change control
Every mandatory ID C with exact evidence; all eight roles operational in approved nonproduction scope; owner-observed issue-to-draft lifecycle and mobile approval/rejection; independent security acceptance, effective permissions, protected signer/sandbox, budget/stop/rollback and no unresolved release-blocking security findings; approved handover to ACA. No automatic merge/deploy. No new features or speculative hardening before closure. New defect affecting an existing criterion is logged under that ID, not counted again. New requirements require explicit owner-approved versioned change with impact and denominator change; deferred #118 H remains visible separately. Update only evidence/status as batches complete. Source readiness does not equal release readiness. No merges, deployments, migrations, credential provisioning, operational signing, dispatch, security-settings changes or additional spend authorized by this document. CAD $0. HOLD until explicit gates pass.

## B01 evidence reconciliation — 2026-11-24
P1-04: merged #15 already includes dropped allowlist event, valid holder, revoked assignee, single-lock and queued eligibility regression cases. Runner blob af86c3f63a6b406a107151f20ae09de0e705172d and test blob cf5c2d815a0797864fc73154b43defda6698c06f identical across tested PR head, merge commit and main. CI 44845417284 passed. #17 lacks queue files at its head (404); do not rebuild or merge it. Independent review disposition and explicit API-error regression evidence remain unverified; D not C. Event-driven recovery requires a later event; no periodic sweep claimed. No administrative closure performed.

Current security draft CI inventory (only PR-triggered first page; CI is not alert clearance):
- #115: Phase 2 Code Scanning Alert Inventory 45092325512 completed/success; Phase 2 dependency security audit 45092325535 completed/success; ACA CI 45092325442 completed/success.
- #122: ACA CI 45293583771 completed/success.
- #123: ACA CI 45269017617 completed/failure.
- #124: ACA CI 45294328363 completed/success.
- #125: ACA CI 45293298561 completed/success.
P2-08/09/10 retain existing status pending per-alert disposition, actual integration and independent review. P2-07 remains blocked on live alert/settings evidence. No repeated checks for already accepted #21/#142/#146. No new scope or restricted operations; CAD $0.

## B01 correction and daily procedure checkpoint — 2026-11-24
- P2-04: SDP-001 v1.1 committed at 7c897b23347df49afac051230b987c6f0a1f8665, adds mandatory Goodnight daily reporting, permanent ID discipline and fixed scope. Draft adoption gate remains open.
- P2-09: CI 45269017617 job 138023618957 failed syntax check in test/browser-session-entropy.test.js due to overescaped regular expressions; tests were skipped. Corrected test regex literals on #123 at 7421a9c6825a4cee598651768a62e717ec620f8c. New CI: []. No claim of alert clearance or acceptance until evidence passes.
- P1-04: issue #16 comments retrieval returned empty; independent review disposition remains unverified; prior merged recovery evidence preserved. No duplicate queue code or PR #17 merge. Remaining acceptance criteria unchanged.
- Fixed totals: 6 C, 23 D, 5 O, 10 B; 44 total. CAD $0; no restricted operations.
