# Eight-agent engineering team and Agent Manager

Owner-approved development reprioritization, 2026-11-23: pause Item 14 at its current draft checkpoint; no closure or release clearance. Build section F's existing eight roles and section G's separate Agent Manager next, in isolated offline development. Keep all prior security gates, including independent reviewer #22, intact. No live dispatch, signing, merges, deployments, secrets/settings changes or live database writes authorized. Item 14 resumes through approved engineering workflows only after applicable security gates. Exact heads/CI: #117 355cefaaf4792ed1ac5382e38163e7b9ee0b9c66 green; #115 2a47fb399b63aebfdc7f5d2bc37afe834623e4f4 green; #122 004ae42c63b9a7ef235d18df15a5377ec2817709 green; #124 35610244314b70bde24491a2a0e42a49a3a01e1d pending run 45294328363; #125 46b534a2031b82dd50a496ae6eb30dbc8cbcd34f green; #127 3e1720882c51ad499862ce39d0be4bdd236e8c6a green; #139 211ef965e0f672223d0d33ee4adc630f319e9dbc green. Remaining: upload cross-instance resource/fencing and pgvector tests; Stripe recovery; verified onboarding; exact-head dependency and CodeQL reconciliation; integrated regression and independent acceptance. Historical alert inventory not live clearance. SDP-001 remains mandatory.

## Canonical roles
Use #118 section F: Project Manager, Solution Architect, Backend Developer, Frontend Developer, QA & Testing, Security Reviewer, DevOps, Orchestrator. Agent Manager is a distinct policy enforcement component, not a ninth worker. This preserves the earlier owner-approved role split; requirements and release coordination belong to Project Manager and Orchestrator/DevOps.

## Acceptance and boundaries
1. Immutable role registry and structured task contracts, deny unknown roles and actions.
2. Manager enforces repository/product scope, bounded attempts and stop/quarantine, independent review separation, audit events without arbitrary payloads.
3. Offline role execution through injected fixture adapters only; no external provider or GitHub credentials, no native dispatch, no network actions. Agent outputs are proposals, not permissions.
4. Individual role behavior tests and integrated disposable lifecycle, with negative tests for cross-scope actions, forbidden operations, cancellation and self-review.
5. Later integrate existing queue/policy/reviewer components after exact-head dependency audit. Real provider-backed agents, durable state, independent security evidence and live activation are separate unchecked gates.

Status: IN PROGRESS. Rollback: abandon isolated draft branch. No production runtime wiring.

## Batch 2 — structured role contracts
Foundation exact head 8e8ce6fe18c53cb631b576a5d1b257732c4e57bd passed CI run 45294951871. Eight role-specific contracts now require bounded arrays of text, reject extra fields and freeze accepted proposals. Trusted adapters are captured at manager construction, never supplied per request. Prior accepted proposals are task-local. This is a trusted in-process fixture boundary, not a sandbox or independent reviewer identity. Real model adapters, capability broker, persistence, cancellation of in-flight work and semantic verification remain pending. No live dispatch or provider use.

## Batch 3 — scoped evidence broker
Offline fixture-only broker grants role-specific issue/source/CI reads. Immutable repository/product/SHA scope, explicit fixture file inventory, bounded reads, session revocation and manager decision audit. No live GitHub API integration, shell, file writes, secrets or dispatch. In-process adapters are trusted code, not an isolation sandbox; source fixture contents must be pre-reviewed and secret-free. Next: durable manager state and authenticated worker identity, then live read-only adapter under applicable authorization.

## Batch 4 — durable queue candidate
Draft PostgreSQL schema and queue service implement role/scoped claims with trusted injected credential verification, database-clock leases, two attempts, terminal expiry, cancellation and atomic audit metadata. No live identity provider, scheduler, manager integration, proposal storage, durable stop/quarantine or owner approval service yet. Mock tests validate SQL contracts, not real database behavior. Before activation: disposable PostgreSQL concurrency/restart tests, authenticated identity issuer, revocation and least privilege, durable budget and emergency stop, explicit result/evidence binding and approval workflow. Expiry must not trigger automatic duplicate side effects. No production migration or dispatch.

## Governance and worker integration checkpoint
Isolated queue integration passed run 45295549380 on head 45b7860. Persistent stop/quarantine and transaction serialization added on subsequent heads. Offline approval policy binds exact scope, SHA, operation and evidence digest; authenticated decision is single-use within an in-memory instance and never authorizes execution. Queue worker claims one assignment, validates trusted loaded task scope, requests an offline manager proposal, and returns only after successful lease completion. No persistent proposal/approval storage, real owner authentication, worker polling, external model calls, or cross-task lifecycle coordination. Stop does not terminate already-running transport. These are draft foundations, not activation clearance.

## Integrated simulation checkpoint
Provider SDK-shaped transport, fixed-origin read-only GitHub HTTP transport, role-scoped evidence broker, durable decision records, proposal digests and nonrefundable call reservations are implemented in draft. Simulation runtime composes all eight roles with injected fixture-only transports, a single scoped assignment, required budget reservation and explicit authorization. Four simulation tests and disposable PostgreSQL concurrent-budget tests added. Previous head 6a56c74 CI 45296479620 was cancelled; no pass claimed. Current exact-head CI must pass before development acceptance. Remaining: actual owner/worker identity, durable workflow and proposal artifacts, real approved provider/GitHub transport, monetary cap and usage reconciliation, controlled patch/test/draft-PR workflow, independent security review, isolated activation approval. No live execution, credentials or migrations authorized. Simulation is not a sandbox for arbitrary injected JavaScript.

## Controlled change proposal checkpoint
Patch planner validates existing allowlisted JS file replacements against pinned source digests, developer-role ownership, size limits, duplicate and stale edit rejection. Draft workflow binds trusted fixture test results to patch evidence and generates draft PR data without write authority. Four negative/positive regression tests added. No actual code execution, GitHub write, provider-driven patch generation, independent review or sandbox is included. Next integrate structured developer model patch output, isolated executable tests and authorized draft-only publication; do not treat fixture passes as real tests.

## Activation preparation checkpoint
Cryptographic identity verification, durable approval records, GitHub read transport, developer patch adapter, trusted sandbox CI probe, monetary reservation ledger and inert runtime initialization are implemented. Trusted sandbox probe and Node CI passed at a776d48 run 45297144234. No generated code execution or draft publication transport yet. See EIGHT_AGENT_ACTIVATION_RUNBOOK.md for remaining finite gates. No production deployment, live provider requests, credentials or database changes.

## Durable eight-agent restart-recovery checkpoint — 2026-11-24

Exact prior baseline 5a6baa1 CI run 45328257276 passed, including Node tests, disposable PostgreSQL queue integration and trusted sandbox probe.

The draft fixture runtime already composes the durable queue, workflow ledger, eight role-specific manager proposals and bounded change-preparation handoff. This batch closes a specific crash window rather than duplicating that integration:
- Manager-only, scope-pinned inspection of a workflow step's durable task state and proposal-receipt presence.
- Explicit resume of an existing workflow from its persisted next_step.
- If a role task succeeded but the process stopped before ledger advancement, validate the durable receipt and advance the existing handoff without rerunning the role.
- If a lease is still running/unknown, return needs-reconciliation and do not reclaim or replay it.
- Terminal failed/cancelled tasks remain blocked for owner reconciliation.
- Disposable PostgreSQL regression coverage simulates both the committed-receipt/pre-ledger crash window and an unresolved in-flight lease.

Implementation commits: f1e5de7 (workflow-step inspection), 5c8144f (restart-aware fixture runtime), 4ee293a (PostgreSQL restart/reconciliation tests). Exact-head CI run 45328768523 (#776) was pending at documentation time. These are fixture-only controls; no live provider, scheduler, GitHub dispatch, production database migration, merge, deployment or activation. Independent reviewer #22 and all SDP-001 activation gates remain mandatory.


## Exact-head policy-revocation fixture correction — 2026-11-24

- Exact head `905fdcb94aca9f295df6c31a42dda6d20eae20e8`; commit message: isolate blocked-policy acceptance fixture from subsequent queue concurrency test.
- Regression semantics established in CI #802: a successful CI event followed by current-policy revocation yields safe idle drain; task remains queued; task loader and proposal generator are not invoked. CI #802 subsequently failed at the later queue-concurrency assertion because this deliberately queued task contaminated the shared fixture.
- Correction: after the regression asserts the queued state, the manager cancels the disposable task and the test asserts its state is cancelled. This keeps the policy assertion meaningful while restoring fixture isolation.
- Exact-head CI #803 (`45331756050`) completed successfully. The available job inventory shows Node tests and trusted engineering sandbox probe passed. A separate PostgreSQL job and CodeQL/dynamic analysis are not present in the returned job inventory; do not claim those checks passed at this exact head. Prior broad CI #801 remains a prior baseline only.
- Remaining next batch: obtain exact-head disposable PostgreSQL queue integration evidence; then exercise sequential eight-role lifecycle, durable proposal handoffs and evidence digest/provenance checks. Continue developer → QA → independent security correction cycles only with genuine role separation and review evidence.
- Status remains offline/draft foundation. No live provider calls, external dispatch, merge, deployment, production database changes, or added spend.


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
