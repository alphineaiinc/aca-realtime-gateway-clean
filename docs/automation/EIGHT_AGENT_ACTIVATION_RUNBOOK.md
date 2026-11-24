# Eight-agent controlled activation runbook

Status: NOT READY FOR LIVE EXECUTION. SDP-001 and independent reviewer #22 remain mandatory.
Scope: PR #142, exact reviewed head only. Item 14 remains open.

## Gate 1 — finish offline development
- Verify all required CI jobs at the current exact head, including PostgreSQL integration and trusted sandbox probe.
- Complete isolated patch execution using a pinned image, disposable workspace, trusted tests, no credentials/network, bounded output and verified cleanup. A successful trusted probe is not proof of arbitrary-code isolation.
- Integrate durable workflow/task inputs, proposal artifact retention, cross-role handoff, and restart recovery.
- Implement draft-only publication with exact-base compare-and-set, independent review evidence, single-use owner authorization, idempotency and recovery after ambiguous writes. No direct main writes.
- Integrate with existing Phase 2 queue/reviewer/policy architecture, rather than assuming independent modules are operational.
- Verify stop/quarantine, revocation, cost reservation and cancellation at actual side-effect boundaries.

## Gate 2 — configuration and owner decision
- Establish dedicated isolated runtime and database roles; no production ACA access.
- Select eight model assignments and verify current provider pricing and conservative maximum billable costs. Configure persistent call/spend caps; reconcile actual usage; disable automatic top-up.
- Provision short-lived GitHub read-only credentials and separate narrowly scoped draft writer only when separately approved.
- Establish trusted owner/worker identity issuer, revocation source and least privilege. Never commit keys.
- Pin image digest and exact repository revision. Prepare manifest and evidence digest.
- Request explicit owner approval for narrowly scoped paid connectivity test, separately from draft publication or any deployment. Approval records alone do not grant execution.

## Gate 3 — controlled verification
- Execute one isolated, bounded read-only assignment with one model request first; verify evidence, costs, logs and stop.
- Run all eight roles against a non-sensitive bounded issue; validate individual quality, cross-role handoffs, failure recovery and independent review.
- Test a disposable patch and draft-only publication after separately authorized security acceptance.
- Confirm no main modification, production access, secret leakage or permission escalation.

## Gate 4 — limited activation
- Obtain independent reviewer acceptance on exact implementation/configuration and owner activation decision.
- Enable only approved capabilities, scope, budget and time window. Start with one Item 14 assignment after applicable security gates.
- On any unknown outcome, stop admission, quarantine affected role, preserve metadata and reconcile manually. Do not retry ambiguous external writes.
- No merge, deployment, signing, production database write or secret change is implied.

## Current verified baseline
Trusted sandbox probe and Node CI passed at a776d4853c9d69a926aaff436868c2a605bc31c7 (run 45297144234). Later changes require new exact-head validation. Inert initialization is not live runtime orchestration. No credentials, provider calls or live migration performed.

## Integrated fixture checkpoint
- Verified baseline ad1f8f8c72aff93a964e54fcbd274efa78a7b5c5, CI 45313271196: persistent eight-role fixture runtime, developer change preparation, publication transport mock tests, disposable PostgreSQL and trusted sandbox fixture. No live model invocation or arbitrary generated-code execution.
- Governance follow-up 0b1598b61a17cfe6998b9ef0b3b7ee8266a777ba: mandatory pre-bound workflow tasks, unique steps, exact claims, transactional handoffs and quarantine denial. Observed CI at documentation time: [{"id":45313627819,"status":"completed","conclusion":"success"}].
- Remaining blockers: actual Phase 2 policy integration and durable dispatch admission; trusted runner for generated code (pinned image and isolation acceptance); independently authenticated review and separate single-use branch/PR admissions with restart reconciliation; actual cost-envelope verification; live artifact classification and retention; durable workflow input and recovery; isolated service/DB role configuration and identity issuance/revocation. GitHub does not provide atomic compare-and-set on PR creation; stale base detection is not an atomic guarantee.
- Do not treat fixture adapters, injected callbacks, approval records or green CI as live authorization. First live test must be bounded read-only, separately approved, with verified budget and no publication. Item 14 remains paused/open; no release clearance.

## Independent review reservation checkpoint
- CI 45314886838 passed at 2cfd43dab7b16b4d7d3ab94117b0699d249d923c.
- Runtime initialization now requires pinned independent reviewer configuration before exposing provider reservation (6691de9); regression tests added (0453609).
- Disposable PostgreSQL review-bound approval, signature, expiry, revocation, substitution, concurrent reservation and budget rollback tests committed at bfbaf13; exact-head CI acceptance pending.
- Standalone offline reservation remains a fixture capability; actual live admission and side-effect enforcement remain outstanding. No live execution authorized. Item 14 remains open.

## Provider failure containment checkpoint
- Transport halts in-process after ambiguous reservation/provider outcomes, missing usage, incomplete output or output ceiling breach; actual attempt counts are preserved. Mock regression coverage at 55b87745d878b0cc58e0764ae6f5a65f4a6ac1dd; CI acceptance pending. No provider calls made.
- Transactional reservation already binds approval, scope, review evidence and persistent call/spend limits. It remains offline-only; restart-safe halt, actual side-effect admission and billing reconciliation are not accepted. Do not enable live transport.

## Durable governance containment
- Scope stop and quarantine deny offline provider reservations across newly constructed adapters and database connections; regression at 743cb65248f38b9cf14f88774be28a0ad66d3001, acceptance pending.
- Manual durable stop is not automatic crash containment. Before live admission, require a durable unresolved-attempt latch committed before external I/O, deny further admission until independent reconciliation, and never automatically refund or retry unknown outcomes. Existing offline reservations do not grant execution.

## Verified containment and cost assessment
- Exact head 02ad38fa291b60535621a231bda8b5c18fca71cf, CI 45317425975: 125 Node tests plus separate PostgreSQL integration passed; trusted sandbox passed. Persistent unresolved/breach admission guard and owner-only fixture reconciliation verified.
- Pinned-rate usage assessment now computes rounded integer micro-USD and detects token ceiling breaches independently of monetary ceiling. This is offline arithmetic, not authenticated provider billing or live admission. New exact-head CI required.

## Cost-bound reconciliation checkpoint
- CI 45317871030 passed at 88d04972363597375bf0d845509972211b2b66b4. Outcome assessment integrated in inert runtime.
- Follow-up binds assessment to exact budget and tests cross-budget denial and token-only breach with derived cost in disposable PostgreSQL. Independent provider billing and live admission remain open.

- Request preparation now requires exact manifest digest and budget identity from the cost envelope and an own positive model ceiling. Offline only; provider tokenizer and billing verification remain required.

## Durable cost evidence binding
- Baseline e620207102634b017060e51a0409eb00bd32c58a passed CI 45319159675. Draft schema now persists exact cost evidence on reservations; reconciliation denies changed or omitted evidence, including same-budget substitution. Unbound fixture reservations remain fixture-only. New exact-head CI required; no live authorization.

## Durable workflow input and restart binding — 2026-11-24

- Draft workflow records now persist the original bounded subject and selected developer role at creation; manager-only readInput() retrieves them under the pinned product/repository/SHA scope.
- Resume no longer accepts caller-supplied subject or developer-role values as authoritative. It loads the immutable workflow inputs from the ledger. The regression test deliberately supplies a substituted subject and asserts the original persisted value is used by the resumed agent team.
- Consumed fixture runtime denial wording was aligned with the fail-closed contract.
- Commits: a2a8baee (denial contract), 8fdf562 (draft schema fields), 8e98243 (ledger input binding/read), 56df7ac (runtime resume binding), 8672d66 and 2b405e4 (regression coverage), 1fb7150 (fresh preparation instance for simulated process restart).
- CI run 45329165830 (#782) failed in the restart integration fixture because the test reused a one-shot change-preparation instance from the pre-restart process. The production contract intentionally consumes that preparation instance. The test now constructs a fresh instance for the simulated restarted process. Exact-head CI for 1fb7150: run 45329317352 (#783), in progress at documentation time; no pass claimed.
- All changes remain draft-only. No live provider, external dispatch, merge, deployment, production migration, or release authorization.

- Follow-up hardening: the draft PostgreSQL workflow table now enforces that subject and developer_role are either both present or both absent; the integration suite checks both the application-level partial-input rejection and direct database constraint rejection. Commits: fab33dd and ce14eda. Exact-head validation is required; earlier runs do not validate these follow-up commits.

## Policy-bound durable queue composition — 2026-11-24

- Added a queue adapter that re-evaluates the existing safe issue policy at each task enqueue, workflow-step inspection and task claim. It binds the decision to the activation manifest digest, issue number, repository, commit SHA and policy version v1; it requires eligibleForPreparation=true and executionAuthorized=false.
- Completion, stop, quarantine, expiry and cancellation remain available without a new admission decision. In particular, an in-flight worker can persist a completion receipt after the policy closes; this does not admit new work or grant execution authority.
- Runtime initialization now exposes only the policy-bound queue when fresh issue-state evidence is configured. If no policy evidence reader is configured, the runtime exposes no queue interface rather than leaking the raw durable queue. Initialization remains inert and does not query the database.
- Regression coverage verifies no raw queue without policy, blocked issue rejection before database access, repeated policy evaluation, and in-flight completion behavior.
- Commits: d84d04a, df21b1d, 2051b72, 319ddc6, 823f83b, cf70046. CI #788 passed at the prior restart-recovery baseline. Exact-head validation for runtime integration and these tests is pending; CI #790 remained in progress and #792 was pending at checkpoint time.
- Draft-only. No scheduler, live GitHub dispatch, provider execution, merge, deployment or production database migration is enabled.

## Blocked continuation safe-stop behavior — 2026-11-24

- CI #796 exposed an integration contract mismatch: the policy-bound queue correctly denied a claim after issue policy closure, but propagated the denial as an exception through the worker/drain/continuation stack.
- Updated the policy-bound claim boundary to return no lease on any policy evaluation/eligibility failure. This is fail-closed: the durable queue's claim method is not called, no worker task is loaded, and no proposal is generated. Enqueue and workflow-step inspection continue to throw on denied policy.
- Regression now asserts the successful CI completion event results in a clean idle drain, with only the policy evaluated and no durable claim, finish, task load or proposal call.
- Commits: 90cda10, cf795ee. CI #796 failed before this correction; exact-head CI for the correction is required and has not yet passed.


## Exact-head authorization-revocation acceptance — 2026-11-24

- Exact head: `905fdcb94aca9f295df6c31a42dda6d20eae20e8`.
- CI run #803 (`45331756050`) completed successfully. The returned workflow job inventory reports Node tests and the trusted engineering sandbox probe both successful. This is exact-head evidence for those two jobs; it does not independently establish a separate PostgreSQL integration job, CodeQL run, or the full multi-analysis matrix from CI #801.
- The policy-revocation regression itself passed in run #802: after a successful CI event receipt, current policy closure yields an idle drain, leaves the task queued, and invokes neither task loader nor agent proposal. Run #802 later failed in a subsequent queue-concurrency assertion because the intentionally queued fixture task remained available.
- Commit `905fdcb94aca9f295df6c31a42dda6d20eae20e8` adds explicit manager-authorized cancellation after the queued-state assertions and verifies the terminal cancelled state, isolating the later concurrency fixture.
- CI #803 passed after that correction. The run exposes two successful jobs (Node tests and trusted sandbox); do not infer a separate disposable PostgreSQL job or CodeQL scan from this run. CI #801 remains the prior broad matrix baseline, not exact-head evidence.
- PR #142 remains draft. No live agent dispatch, provider admission, merge, deployment, secret activation, production database mutation, or additional spending.
- Next acceptance: run/verify the disposable PostgreSQL queue integration against this exact head, then continue integrated role handoffs and durable proposal/evidence verification. Keep all acceptance states distinct: implemented, unit-tested, integration-tested, independently reviewed, operationally accepted, and activated.


### CI #803 log-level verification correction — 2026-11-24
- Retrieved and inspected the complete Node job log for run #803, not just the job summary. The Node job ran both the standard Node suite and the isolated PostgreSQL queue integration as sequential test commands.
- Standard Node suite: 167 tests, 166 passed, 0 failed, 1 skipped.
- Isolated PostgreSQL queue integration: 1 test, 1 passed, 0 failed, 0 skipped. The deliberately rejected SQL writes in the fixture appear as expected PostgreSQL constraint/unique-violation log entries; the integration test itself passed.
- Trusted engineering sandbox probe: passed; verified non-root, loopback-only, read-only root, no credentials/socket, no capabilities, seccomp and no-new-privileges. Patch fixture ran in a network-disabled, read-only container with resource limits.
- Therefore CI #803 does include successful disposable PostgreSQL queue integration within the Node job; earlier note saying a separate PostgreSQL job was absent was too narrow. CodeQL and the additional Python/JavaScript/Actions analyses from CI #801 are still not evidenced by #803.


## Eight-agent sequential workflow and durable evidence acceptance — 2026-11-24

- Code/test head: `08a684235bc0af32dac9174b6a634bf04c91c72f`; exact-head CI #809 (`45333026293`) passed.
- Standard Node suite: 167 total, 166 passed, 0 failed, 1 skipped. Disposable PostgreSQL queue integration: 1 passed, 0 failed. Trusted sandbox probe and trusted planned-patch fixture: passed.
- Added PostgreSQL integration coverage proving that a role-level policy closure pauses the durable workflow at the current next_step, and that a fresh runtime after policy reopening resumes only the remaining roles. The final workflow reaches next_step 8; already completed role handoffs are not replayed.
- Added evidence-integrity coverage that mutates a persisted fixture proposal body after its handoff and verifies manager-only readFixturePrior rejects the altered body because its SHA-256 no longer matches the durable proposal receipt.
- CI #808 initially failed in the new resume fixture because it reused a one-shot change-preparation instance consumed by the earlier workflow. The test now creates a fresh preparation instance to model a process restart. This is a test-fixture correction, not a production runtime behavior change.
- Earlier CI #803 exact-head policy-revocation regression remains passing. This batch extends sequential handoff acceptance and durable evidence tamper detection.
- Draft-only fixture acceptance. It does not validate live provider execution, real model output quality, live GitHub writes, independent security review, deployment isolation, or operational activation. No merge, deployment, secret activation, production database change, live dispatch or additional spend.
- Next: complete developer → QA → security-review correction-cycle acceptance against exact-head evidence, then transactional spend/provider-admission and emergency-stop/quarantine recovery gates. Preserve independent reviewer #22.


## Durable developer → QA → security correction-cycle acceptance — 2026-11-24

- Code/test head: `39a0044e06d940137b1db97d9da48bd2c9dc6a4b`; exact-head CI #812 (`45333437808`) passed.
- Standard Node suite: 167 total, 166 passed, 0 failed, 1 skipped. Disposable PostgreSQL queue integration: 1 passed, 0 failed. Trusted sandbox probe and trusted planned-patch fixture passed.
- Added end-to-end disposable PostgreSQL acceptance for durable correction admission: a succeeded backend-developer task and its exact proposal receipt digest are admitted into the correction-cycle ledger; isolated verification reports a repairable Node-test failure; bounded developer correction produces a new pinned patch; isolated retest passes; security-review role returns a recommendation bound to the corrected candidate digest.
- Assertions verify exactly two isolated test runs, one correction proposal, one security-review recommendation, durable initial digest persistence, one-shot runtime consumption, and no release/execution authorization.
- CI #811 initially failed only because the test expected the wrong one-shot error wording (`Correction unavailable` vs actual `Correction runtime consumed`). The assertion now checks the stable consumed contract; no runtime implementation change was needed. Exact-head CI #812 passed.
- This is offline test-adapter and disposable PostgreSQL evidence only. The security role output is a recommendation fixture, not an independent security audit or GitHub approval. No live model/provider execution, privileged GitHub write, merge, deployment, secret activation, production DB mutation or additional spend.
- Next acceptance: transactional spending/provider admission at real side-effect boundaries, then emergency stop/quarantine/recovery and adversarial policy checks. Independent reviewer #22 remains an external release gate.


## Owner-approved emergency stop and quarantine recovery acceptance — 2026-11-24

- Code/test head: `a35433b64abc12ff00f87ba5764da41d30e166cb`; exact-head CI #822 (`45334465026`) passed.
- Standard Node suite: 170 total, 169 passed, 0 failed, 1 skipped. Disposable PostgreSQL queue integration: 1 passed, 0 failed. Trusted sandbox and planned-patch fixture passed.
- Added `queue.recover` as a durable owner-approval operation and a draft migration table for single-use recovery audit records. Recovery binds exact product/repository/SHA, clear-stop vs clear-quarantine action, and role where applicable.
- Recovery requires a queue-manager requester and a distinct owner.approval decision, exact evidence digest/binding, unexpired approved request, transactional scope lock and single-use audit. It refuses recovery while relevant task leases are running; clearing a repository stop also refuses unresolved provider attempts. No recovery path grants execution authority.
- Disposable PostgreSQL integration proves: quarantine blocks claim; separately owner-approved clear-quarantine restores the eligible queue; duplicate recovery is rejected; stop clear is denied while a lease is active; manager cancellation permits separately approved recovery; queued work resumes only after stop clear; unresolved provider attempt blocks a later stop clear and leaves the stop active.
- Unit tests cover malformed evidence/target, missing approval, wrong identity, active lease and replay. CI #821 failed at syntax check due a duplicate test fixture identifier; renamed it and exact-head CI #822 passed. Earlier CI #819 exposed a test assertion calling executionAllowed on the queue rather than recovery gate; corrected and #820 passed before the final unresolved-provider assertion was added.
- This is disposable PostgreSQL acceptance only. No production migration or database modification, live agent/provider execution, merge, deployment, secret activation or additional spend. The recovery approval is not approval for live activation.
- Remaining: operational recovery playbook/notification, adversarial policy and multi-tenant scope checks, full independent security review (#22), and controlled operational acceptance.


## Provider authorization and transactional spending boundary acceptance — 2026-11-24

- Code/test head: `3b845f0d79c00e7e8746a9e93e7a74f3012464aa`; exact-head CI #826 (`45334968283`) passed. Preceding unit-level authorization recheck commit also passed CI #825 (`45334770684`).
- CI #826 standard Node suite: 171 total, 170 passed, 0 failed, 1 skipped. Disposable PostgreSQL queue integration: 1 passed, 0 failed. Trusted sandbox and planned-patch fixture passed.
- OpenAI transport now re-evaluates authorization after durable spend reservation and immediately before the external provider call. If policy is revoked after reservation, the provider is not called, provider call accounting remains zero, and the reservation remains consumed (no refund or automatic retry).
- Added a PostgreSQL integration assertion using the real transactional spend-budget adapter: reserve one call/100 micro-USD, revoke authorization at the second check, verify zero provider calls and zero transport calls while the durable budget remains reserved at 1 call/100 micro-USD.
- Existing exact-head integration coverage continues to exercise concurrent call/spend ceilings, provider approval and independent-review evidence binding, current queue policy, stop/quarantine denial, cost-evidence substitution rejection, usage assessment, unknown outcomes and breach-triggered persistent stop.
- No live provider SDK client, real provider pricing verification, external provider call, production billing reconciliation, merge, deployment, secret activation, production DB modification or additional spend was performed. The SDK transport remains injected/mock-only; operational admission and independent security review remain separate gates.
- Next: finalize adversarial multi-scope and emergency-stop notification/recovery evidence; then complete independent reviewer #22 and operational acceptance. Do not mark live agents activated based on offline CI.


## Provider call/spend ceiling exhaustion acceptance — 2026-11-24

- Latest code/test head: `f6f20decf76bd9eccd86f8c1c640087b3abc9bf0`; exact-head CI #835 (`45335732516`) passed.
- Standard Node suite: 171 total, 170 passed, 0 failed, 1 skipped. Disposable PostgreSQL queue integration: 1 passed, 0 failed. Trusted sandbox and planned-patch fixture passed.
- Expanded PostgreSQL provider-reservation acceptance to isolate the two independent durable ceilings from the unresolved-attempt circuit breaker. After each successful reservation, the test records a completed outcome before attempting the next request.
- Call cap: eight approved/reserved/reconciled calls are admitted; the ninth is denied. Spend cap: one 400-micro-USD reservation exhausts the 400-micro-USD budget; after outcome reconciliation, a second approved request is denied. In both cases persisted reserved_calls/reserved_microusd and provider-attempt row counts remain at the exact cap.
- CI #828 exposed a test setup mismatch between budget-row max_calls and manifest limits. The first correction attempted maxCalls=1, which the manifest intentionally disallows (minimum 8); the final test exhausts the supported eight-call cap instead. CI #833 then failed on the invalid test configuration; exact-head CI #835 passed after correction.
- This remains offline mock-provider and disposable PostgreSQL evidence. No real provider call, production billing, live credentials, production DB change, merge, deployment or added spend.


## Provider call-count and monetary budget exhaustion acceptance — 2026-11-24

- Code/test head: `f6f20decf76bd9eccd86f8c1c640087b3abc9bf0`; exact-head CI #835 (`45335732516`) passed.
- Standard Node suite: 171 total, 170 passed, 0 failed, 1 skipped. Disposable PostgreSQL 17 queue/provider integration: 1 passed, 0 failed. Trusted engineering sandbox probe passed.
- Extended the PostgreSQL-backed provider reservation test with two distinct owner-approved request sets and distinct request-evidence digests. The call-cap case exhausts all eight manifest-authorized calls, reconciles each attempt, then verifies the ninth request is denied. The spend-cap case reserves the full 400 micro-USD ceiling, reconciles the attempt, then verifies the next independently approved request is denied.
- Both cases assert durable reserved call/micro-USD totals and that the rejected request leaves no provider-attempt row. Attempts are reconciled between reservations so the unresolved-outcome circuit breaker cannot mask the budget ceiling being tested.
- An initial test iteration failed because the activation manifest correctly rejects a configured maxCalls below eight. The fixture was corrected to preserve the eight-call manifest floor and exercise exhaustion by consuming the available allowance. Exact-head CI #835 passed.
- No production runtime code, database schema, credentials, or provider client was changed. This is disposable PostgreSQL acceptance only; no live provider calls, billing, production DB changes, merge, deployment, secret activation or additional spend.
- Next: adversarial multi-scope isolation and operational stop/quarantine notification evidence, followed by independent security reviewer #22. Reviewer #22 remains HOLD; offline acceptance does not clear it or activate agents.


## Cross-product durable queue isolation acceptance — 2026-11-24

- Latest code/test head: `17c50069fd0a38667de2291b3e10ee6b1e637570`; exact-head CI #839 (`45336011070`) passed.
- Standard Node suite: 171 total, 170 passed, 0 failed, 1 skipped. Disposable PostgreSQL queue integration: 1 passed, 0 failed. Trusted sandbox and planned-patch fixture passed.
- Added PostgreSQL integration with two product identities sharing the same repository and commit SHA. A stop for Product A blocks Product A claims only; Product A's worker cannot claim Product B's task; Product B's worker can claim and complete its own task. Product A's queued task remains queued.
- Provider budget cap tests now separately exhaust the supported eight-call cap and the 400-micro-USD spend cap after reconciling each completed attempt, avoiding false positives from the unresolved-attempt circuit breaker.
- This confirms offline repository/product isolation in the durable queue and independent call/spend ceiling enforcement. It does not establish production multi-tenant authorization, live event ingestion, provider operation or deployment isolation; those require operational acceptance and independent review.
- No live agents/providers, production database changes, merge, deployment, secrets or additional spend.


## Provider stop and spend-budget repository isolation acceptance — 2026-11-24

- Code/test change: `ff32b69350c90c6ec35855d3294b8c259a64e520`; validated by exact-head CI #841 (`45336133873`) at branch head `194e31f27a39a68d3ab98b425793e45f3b5922e2`.
- Node suite: 171 total, 170 passed, 0 failed, 1 skipped. Disposable PostgreSQL 17 integration: 1 passed, 0 failed. Trusted engineering sandbox passed.
- Added a second repository scope for the same product with separate queue-manager and owner identities, independent approval policy and spend budget. After an unknown provider outcome creates a persistent stop for repository A, repository B successfully reserves and reconciles its own approved provider attempt.
- Assertions verify repository A's stop remains present, repository B has no stop, and repository B's reserved counters are isolated at 1 call / 400 micro-USD. This exercises repository-level isolation in provider reservation, approval, outcome and stop predicates.
- Combined with the preceding cross-product queue isolation acceptance and provider cap exhaustion coverage, this strengthens offline tenant/repository separation. It does not prove production multi-tenant auth configuration or deployment isolation.
- No production runtime/schema change, live provider call, merge, deployment, secret activation, production database change or additional spend. Independent reviewer #22 remains HOLD.


## Durable governance alert journal and scoped operator read access — 2026-11-24

- Code/test head: `85e8437eca46e8d87189127d672fad355fd10c84`; exact-head CI #854 (`45337115366`) passed.
- Standard Node suite: 173 total, 172 passed, 0 failed, 1 skipped. JavaScript syntax check passed. Disposable PostgreSQL 17 queue integration: 1 passed, 0 failed. Trusted engineering sandbox probe passed.
- Added `engineering_team_governance_alerts`, a durable, metadata-only journal written in the same transaction as stop/quarantine creation and owner-approved recovery. Duplicate idempotent stop/quarantine requests do not create duplicate alert rows. Failed recovery (active lease or unresolved provider attempt) does not emit a cleared event.
- Added a read-only governance alert reader, scoped to the exact configured product/repository/SHA and queue-manager identity, with a bounded 1–100 result limit. Runtime initialization exposes the reader but remains inert and grants no execution authority.
- PostgreSQL acceptance verifies stop/quarantine created and cleared events, approval ID linkage, idempotency, no false clear event on failed recovery, and scoped retrieval without evidence digests or credentials. Unit tests verify authorization and bounded query behavior.
- CI #852 caught an escaped-slash syntax defect in the new reader; fixed. CI #853 then exposed a stale unit-test expectation after the new alert insert; updated assertions. Exact-head CI #854 passed all checks.
- Important boundary: this is a durable alert journal and operator read API, not an external notification delivery service. No email/Slack/webhook dispatch is enabled or claimed. No production migrations, live provider/agent activation, merge/deploy, secrets, production DB changes or additional spend.
- Independent security reviewer #22 remains HOLD; PR #21 has no submitted review. Offline acceptance does not satisfy the independent review gate.


## Batch 8 verified provider stop alert acceptance — 2026-11-24
- Exact code/test head `26e85a555cf6814e2d2007bc5f4bf0195346114c` passed CI #859 (45390579652), including syntax, Node suite, disposable PostgreSQL integration and trusted sandbox.
- Provider breach and unknown outcomes now journal newly created stops transactionally; duplicate stop creation does not duplicate alerts, and journal failure rolls back the outcome transaction. Integration checks stop denial across all eight roles.
- Offline acceptance only. Independent review #22, external notification delivery and live activation remain outstanding.
