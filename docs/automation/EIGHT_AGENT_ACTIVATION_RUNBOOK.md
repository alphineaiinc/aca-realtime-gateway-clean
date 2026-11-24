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


## Independent review remediation batch — 2026-11-24

- Review evidence on PR #142 reported six unresolved findings: mutable-scope authorization races in durable approval and queue identity checks; caller-supplied scope forwarding in the policy facade; recovery approvals not bound to a specific stop/quarantine incident; CI receipt primary key omitting product; and fixture preparation replay after restart.
- Draft branch remediation committed: capture the expected scope key before asynchronous authentication in durable approval/queue; pin the policy facade to its configured product/repository/SHA and reject cross-scope inputs; include product in the CI event admission primary key; bind recovery evidence, audit and deletion to a persisted incident UUID; persist one-shot fixture preparation state and result digest so completed preparation returns recorded evidence and unknown started attempts require reconciliation.
- Added unit regression coverage for scope mutation during authentication, durable approval scope mutation and cross-product facade input. Extended the disposable PostgreSQL integration test to verify completed preparation survives a fresh runtime without replay.
- Current code/test head: `f4a7126dcfc2e86f9136ee2edd7c8790d770def2`. Exact-head CI has NOT yet been observed for this head; do not mark these changes tested or accepted until CI executes and passes.
- Recovery and preparation changes are development-only schema/code. The migration remains draft and must only be exercised in disposable CI. No production migration, live provider, agent dispatch, merge, deployment, credential change or additional spend.
- Review findings remain open until independently re-reviewed against the corrected head. PR #21's Copilot review reported insufficient remaining quota; no successful independent reviewer clearance is established. Agent Manager remains not activated.


## Security review remediation and exact-head CI — 2026-11-24

- Copilot's review of PR #142 identified six issues: mutable-scope identity comparisons in durable approvals and queue authentication; recovery approvals not bound to a specific incident; policy-bound queue forwarding caller-controlled scope; CI event admission key missing product; and fixture preparation replay after restart.
- Subsequent implementation commits on the PR branch now capture expected scope before authentication, bind recovery evidence and deletion to immutable incident IDs, pin and validate facade scope before policy evaluation/queue forwarding, include product in the CI receipt primary key, and persist one-shot preparation attempts/results with unknown attempts requiring reconciliation.
- The original review threads remain formally unresolved until the reviewer rechecks the corrected exact head. Do not count implementation alone as independent acceptance.
- Exact-head CI failure 45400545419 was caused by a stale PostgreSQL integration fixture calling recovery without the now-required incident ID. The fixture now reads the disposable incident IDs and binds them into evidence and recovery calls.
- Exact head: d93e2397e390ca3a10a4c99be3e7eb91cd7bf057. CI run 45401717224 passed: Node tests (186 passed, 1 skipped), isolated PostgreSQL queue integration passed, trusted sandbox probe passed. This validates the current draft head's tests, not live execution or independent security clearance.
- PR #21 Copilot review attempt failed due to insufficient reviewer quota. A Codex report has not been supplied or independently verified. Security gate #22 remains open; PR #142 remains draft. No live agents, provider admission, merge, deployment, production DB write, or additional spend is authorized.


## Additional adversarial scope-race acceptance — 2026-11-24

- Added owner-decision TOCTOU regression for durable approvals: caller mutates the allowed scope during asynchronous authentication; the identity check rejects before SQL executes.
- Added policy-bound queue snapshot regression: caller-owned request scope and original configured scope are mutated while policy evaluation is pending; the underlying queue receives only the immutable configured scope snapshot.
- Exact code/test head: bdd5754000399515be4f841efb9c81f33af5f843. Exact-head CI run 45403274490 passed: Node tests 189 total, 188 passed, 0 failed, 1 skipped; isolated PostgreSQL queue integration passed; trusted sandbox probe passed.
- These tests strengthen regression evidence for findings already addressed in implementation; they do not substitute for independent security review. Five inline Copilot threads remain unresolved pending reviewer confirmation. Attempted to request Copilot directly, but GitHub rejected the request because the reviewer account is not a repository collaborator. PR #21's earlier Copilot review attempt was quota-blocked; no independent human/Codex signoff has been recorded.
- PR #142 remains draft. No live agent dispatch, provider calls, merge, deployment, production DB changes, secret activation or additional spending.


## Independent security assessment remediation batch — 2026-11-24

Assessment source: user-provided independent security assessment. Its PR #142 findings were reviewed against the live draft head; the report's reviewed PR #142 SHA (17a6ecef870a2dd2df2891bb470fe299b37439ad) is older than the current draft head and is not treated as the current artifact.

### Code-level hardening added in this batch
- openaiTransport.js now refuses construction without both durable reservation and consumption functions. Before SDK invocation it requires a reservation explicitly marked executionAuthorized=true, bound to the canonical request digest and model, then requires successful single-use consumption of that exact binding. The existing providerReservation.js is explicitly offline-only and returns executionAuthorized=false, so it cannot authorize this transport. Fixture tests cover absent admission, offline reservation denial, mismatched/denied consumption, and the positive mock contract. No real provider was called.
- Restricted observation now classifies every completed CI result other than success as ci_attention, including cancelled, skipped, stale, neutral and missing/unknown conclusions.
- Governance alert counts are labelled repository-wide; the current schema has no head SHA on governance alerts, so the count is not represented as current-head-specific.
- Restricted GitHub transport is pinned to one configured repository; requests that attempt to change repository scope are rejected.
- The candidate-controlled sandbox job was removed from CI. It is not an independent security attestation; no sandbox job will be represented as trusted until a harness supplied by a protected revision is available. The previous sandbox smoke failure at run 45405331222 was due to the base revision not containing the candidate-only fixture; the later syntax failure in 45405646787 was corrected.
- Earlier scope-race, incident-specific recovery, product-scoped CI receipt key and durable preparation-replay fixes remain in the branch, with their regression tests.

### Exact-head validation
- Current code/test head at this note: 3d6eafd47ac8ca4b227aeded8ef7d009956593fe.
- CI run 45405863957 is in progress; no pass is claimed for this head yet.
- PR #142 remains draft. No merge, deployment, live dispatch, provider request, production DB change, secret activation or additional spending occurred.

### Still open — must not be inferred complete
- PR #21 signing trust root and protected immutable deployment artifact; actual key custody, one-repository GitHub App permission proof and release controls.
- Genuine independent reviewer identity and substantive security disposition bound to repository, PR, head and verified issue. Copilot quota/collaborator limitations are not approval.
- PR #21 reviewer pagination/large-PR coverage, coherent CI workflow-run/attempt binding, database role privilege and RLS verification, and trusted-ref restriction for manual observer workflow.
- Operational proof that the restricted observer has a dedicated single-repository read credential, SELECT-only scoped DB role if DB observation is enabled, no queue/provider/publication/deploy credentials, verified disable procedure and attributable credential-free audit history.
- Trusted sandbox attestation from protected workflow/harness, pinned image and tested-patch provenance.
- Provider-side spend ceiling, automatic reload disabled, actual pricing/token limits, reservation-to-dispatch enforcement in a separately accepted live adapter, multi-process stop/revocation tests and ambiguous-outcome reconciliation.
- Independent acceptance of the exact fixed PR #142 SHA and separate owner approval remain mandatory before activation.


## Exact-head acceptance update — 2026-11-24

- Superseding the earlier pending checkpoint: PR #142 exact head `1607ed198cb060837b0eb118a31bb8bdb9621478` passed ACA CI run `45407240203`.
- Node suite: 194 total, 193 passed, 0 failed, 1 skipped. Isolated PostgreSQL queue integration passed.
- PR #142 remains draft/open. Five original inline review threads remain unresolved pending independent confirmation; the CI receipt product-key finding is the one resolved thread.
- PR #21 exact head `8e96ad2a67c559f84ab166538ab6bb05f1137878` passed its three associated CI runs: `45406657995`, `45406657657`, `45406657804`. GitHub review records still contain only a quota-blocked Copilot COMMENTED notice, not an independent approval.
- Restricted observation remains disabled. Candidate-controlled sandbox CI was removed pending a protected harness. PR #21 signer trust root, key custody, substantive security disposition, DB role/credential verification, provider-side spend cap and deployment isolation remain unaccepted.
- No merge, deployment, secret activation, production DB change, live agent dispatch or real provider call.


### SEC-09 publication hold
Post-admission reference rechecks are defense in depth, not atomic publication. Keep live publication disabled until protected reference ownership, authenticated requester-bound durable admission, uncertain-outcome reconciliation and duplicate prevention are independently accepted. Never retry an ambiguous POST merely because a client timed out. Reconcile exact repository, base/head revisions, branch and durable binding first; unresolved outcomes remain blocked. External runner cancellation requires independently verified termination or quarantine. No operational acceptance is claimed.


## SEC-09 durable publication reconciliation — source-level checkpoint
The draft migration adds `engineering_team_publication_reconciliation`, keyed to a reserved publication binding and constrained to the exact product, repository, base/head revisions, requester, observation state and digest. UPDATE/DELETE are rejected by a database trigger; PUBLIC is denied UPDATE/DELETE/TRUNCATE. The store re-authenticates the queue manager, joins the reservation to its unexpired approved `github.write` request, checks requester/binding/evidence-digest equality, locks the reservation, requires a separately injected independent observation verifier, and persists one immutable result. Duplicate calls return the existing result without recollection. Unknown or conflicting observations remain unresolved; no result authorizes retry, execution or live publication. Regression coverage includes PostgreSQL transaction integration, idempotent replay, immutable rows, authentication rejection, scope mismatch and rollback. Migration remains draft source only and has not been applied to any database. Exact-head CI is pending.

### SEC-09 independent GitHub evidence collection boundary
- `githubPublicationEvidenceBoundary.js` performs read-only GitHub REST GETs for the exact repository/base/head branch scope. Non-200 responses and potentially truncated 100-item results fail closed; absence is never treated as proof that a prior write did not occur.
- Collection and verification require distinct fetch implementations and distinct token-provider functions. The verifier independently re-fetches the scoped PR evidence and compares the complete observation digest using timing-safe digest comparison. The integration point is `createReconciliationStore({ collect: boundary.collect, verifyObservation: boundary.verify })`.
- The two token providers must be independently controlled read-only identities in any future operational configuration. This source change does not provision credentials or prove that deployed identities are independent. No token values are stored or logged by the boundary.
- The collector supports a single-page bounded observation only; when 100 or more PR records are returned, it fails closed pending a complete pagination implementation. It never calls POST/PATCH/PUT/DELETE and cannot create, edit, merge, or retry a pull request.
- Unit tests cover independent GET transports, changed/tampered observations, scope substitution, pagination uncertainty, non-200 responses and transport/token-provider separation.
- Exact-head CI and PostgreSQL integration remain required. No migration has been applied; no production data, credentials, merge, deployment, signing or agent dispatch is authorized.
