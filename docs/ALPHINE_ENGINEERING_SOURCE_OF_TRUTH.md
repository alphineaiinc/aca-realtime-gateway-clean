# Alphine AI — Engineering Source of Truth

Status: **proposed baseline, awaiting owner review and merge**. Updated 2026-11-22. Repository: `alphineaiinc/aca-realtime-gateway-clean`.

## Document versioning policy

- Version: **v1.4.2-draft**. Baseline: v1.0.0-draft. This document is currently proposed in PR #121, not merged.
- Every material update MUST increment the document version, add a new append-only change-log entry with an ISO-8601 UTC timestamp (YYYY-MM-DDTHH:mm:ssZ), identify **Added / Changed / Removed / Verified / Still unverified**, and link the PR, commit SHA and evidence.
- Use the Git commit's authoritative timestamp when an exact timestamp is required; never invent one. Draft entries can state the calendar date and Git-commit timestamp reference until the exact time is retrieved.
- Never rewrite or delete historical entries to conceal a change. Correct inaccuracies with a new entry explaining the correction. Git history remains the underlying immutable revision trail, subject to repository permissions.
- Versioning: major = approved architecture/boundary change; minor = new capability or substantive scope addition; patch = documentation/evidence/status correction. Proposed changes remain draft until approved and merged.
- Maintain this document and the Phase 2 tracker together; reconcile version, evidence and checklist status in the same PR when relevant.

## Append-only change log

| Version | Timestamp | Added | Changed | Removed | Verification / reference |
| --- | --- | --- | --- | --- | --- |
| v1.0.0-draft | 2026-11-22; Git commit timestamp | Initial eight-role baseline, implementation inventory, acceptance tracker links, safety gates | Reconciled claimed agent count with evidence status | None | Commit `6861f165e2f054cac24dc9886a8c8f6c17f60d0f`; PR #121; eight executable roles not yet audited |
| v1.4.2-draft | 2026-11-23T03:50:10.683Z | Item 13 independent-review readiness checkpoint | No GitHub reviews found for PR #117; noted residual diagnostic leakage risks; 12/66 checklist unchanged | None | PR #117 `b80fc83`, Issue #118; independent signoff pending |
| v1.4.1-draft | 2026-11-23T03:49:08.793Z | Verified Item 12 exact-SHA CI and isolated CodeQL evidence | Phase 2 tracker 12/66 checked, 54 pending; TTS mocked behavior accepted with explicit fallback limitation | None | PR #117 `b80fc83`; ACA CI 45106881883 (38/38); isolated CodeQL 45106881940 (0 SSRF); Issue #118 |
| v1.4.0-draft | 2026-11-23T03:27:17.603Z | Company vision, future prospects, founder reporting roadmap and 19 Phase 2 acceptance gates | Tracker now 11/66 checked, 55 pending; formalizes eight-agent and Agent Manager exit criteria | None | Issue #118; draft roadmap only, email not yet configured |
| v1.3.0-draft | 2026-11-23T03:14:46.355Z | Explicit eight-agent delivery commitment, acceptance requirements and delivery stages | Clarified target architecture versus verified implementation | None | Owner's eight-agent direction; this is a roadmap commitment, not proof of implementation |
| v1.2.1-draft | 2026-11-23T03:13:02.834Z | PR #117 TTS error-redaction code and regression test references | Item 12 remains pending until exact-SHA CI/CodeQL and full acceptance | None | PR #117 head `befc3093e1f30dd1d23a53bfcfdec6b9f9cf`; tests not yet verified |
| v1.2.0-draft | 2026-11-23T03:07:36.282Z | Eight-role evidence matrix, verified iPhone push delivery, exact test links | Updated notification status and role-by-role distinctions | None | PR #121; Issue #118; bot comment 7090423512; user screenshot confirms push; unverified roles remain open |
| v1.1.0-draft | 2026-11-22 (UTC; exact time recorded by Git commit) | Versioning policy and append-only change log | Requires version bump, timestamp, delta, references on each future update | None | This PR #121 revision; exact timestamp and SHA from resulting Git commit |

## Purpose and authority
This document distinguishes **agreed design**, **verified implementation**, **verified tests**, **pending validation**, and **operational activation**. Never infer one from another. Before reporting progress, inspect this document, Issue #118, the relevant exact branch/commit, CI runs and deployment state. GitHub code/evidence overrides conversational recollections. If evidence conflicts, flag the discrepancy rather than changing the architecture silently.

## Agreed eight-agent target architecture (NOT eight independently verified deployed agents)
1. Project Manager — backlog, planning, dependencies.
2. Solution Architect — APIs, data models, architecture.
3. Backend Developer — services, database, integrations.
4. Frontend Developer — web UI and dashboards.
5. QA & Testing — test design, regression and validation.
6. Security Reviewer — independent risk and code review.
7. DevOps — CI/CD, reliability, deployment preparation.
8. Orchestrator — dispatch, policy, coordination and status.

**Important:** The eight-role architecture is the agreed design baseline. This audit has NOT verified eight distinct executable agent implementations, independent tests or live dispatch. Do not call them complete or remove roles without owner approval. A role may share an execution engine with others, but its implementation and acceptance evidence must be documented separately.

## Eight-agent delivery commitment and acceptance contract

**Decision:** All eight named roles remain in scope and **will be built and verified** as part of the Alphine AI engineering automation target. None is cancelled, removed or optional. This is a **delivery commitment**, not a statement that eight independent agents already exist or that their activation has been authorized. The exact Phase 2 versus subsequent-phase release allocation is to be tracked explicitly; do not silently defer roles or reclassify them as already complete.

| Agent | Delivery commitment | Minimum functional acceptance | Existing supporting implementation | Remaining work |
| --- | --- | --- | --- | --- |
| Project Manager | Build | Issue intake, priority/dependency planning, tracked milestones and owner escalation | Issue #118 and safe queue | Dedicated agent behavior, tests, orchestration integration |
| Solution Architect | Build | Produce architecture/API/data-model proposals with reviewable rationale | `AGENTS.md` architecture policies | Executable role, design validation and tests |
| Backend Developer | Build | Bounded backend changes with draft PRs, tests and no unauthorized merge | ACA backend, manual Codex workflow | Autonomous bounded coding integration and tests |
| Frontend Developer | Build | Bounded UI changes, accessibility and visual/regression evidence | Existing ACA dashboard code | Dedicated UI agent and validation |
| QA & Testing | Build | Independent test generation, execution, regression reporting and failure escalation | CI and regression tests | Autonomous QA role, evidence and isolation |
| Security Reviewer | Build | Independent security findings and fail-closed review with verifiable provenance | Draft PR #21, issue #22 | Independent audit, staging proof and approval gate |
| DevOps | Build | CI/CD maintenance, monitoring, rollback proposals, approval-gated deployment | CI, queue and notification workflows | Dedicated operations agent, controls and tests |
| Orchestrator | Build | Policy-bound assignment of seven roles, deduplication, retries, audit, cancellation, budget and approval gates | Safe queue policy/runner and GitHub workflows | Complete dispatch lifecycle and end-to-end proof |

**Common acceptance for each agent:** (1) entrypoint/configuration mapped to exact commit, (2) bounded role permissions and threat model, (3) dedicated unit and integration tests passing, (4) observable outputs and auditable actions, (5) failure/rollback behavior tested, (6) independent review where required, (7) explicit owner authorization for any privileged activation. Mark as `Planned`, `Implemented`, `Tested`, `Integrated`, or `Operational` only with linked evidence; do not collapse statuses. Agent role count is not concurrent worker count.

**Execution order:** stabilize shared orchestration/security boundaries and the current Phase 2 acceptance backlog, complete the agent-specific implementations and integrations in coordinated batches, then demonstrate safe cross-product operation. Preserve owner approval gates and document any proposed phase allocation changes before accepting them.

## Evidence-backed implementation inventory
| Component | Evidence | Current classification |
| --- | --- | --- |
| Agent contribution rules | `AGENTS.md` | Implemented policy instructions; not a standalone agent |
| ACA CI | `.github/workflows/ci.yml`, `docs/development-automation.md` | Implemented; prior CI evidence documented |
| Safe issue queue | `.github/workflows/safe-codex-queue.yml`, `src/automation/safeQueuePolicy.js`, `.github/scripts/safe-queue-runner.js` | Implemented with tests; native Codex dispatch **manual** |
| Coding agent / Codex | `docs/development-automation.md`, `docs/codex-dispatch-feasibility.md` | Manual UI assignment/review documented; automatic native coding-session dispatch unproven |
| Security reviewer | Issue #22 and draft PR #21 | Under independent security audit; not approved for privileged operation |
| Phase 2 completion notifications | PR #119, PR #120, `.github/workflows/phase2-item-notifications.yml` | Merged workflow; bot comment and iPhone banner confirmed on 2026-11-22; continued delivery not guaranteed |
| TTS SSRF remediation | Issue #116 and draft PR #117 | Tests and isolated CodeQL evidence exist; independent review/final acceptance pending |
| SMTP TLS remediation | Draft PR #115 | Final SHA audit/review/disposition pending |
| Verified Twilio tenant routing | Draft PR #2 | Not merged or production-deployed; preserve explicit owner approval |
| Eight separate role implementations | No eight-role file/test inventory completed | **Unverified**; must audit before claiming completion |

## Canonical completion tracker
Issue [#118](https://github.com/alphineaiinc/aca-realtime-gateway-clean/issues/118) is the Phase 2 acceptance checklist. At baseline: **46 items, 10 checked, 36 unchecked**. This is checklist progress, NOT percentage of engineering work or count of agents. Keep exact PR SHA, test/run evidence, independent reviewer, and acceptance disposition for each completed item.

### Remaining work (authoritative detail lives in #118)
- Security: inspect SARIF/default CodeQL, complete TTS and SMTP hardening, triage alerts, verify security settings, least privilege and rollback.
- Independent reviewer: reproducible build, independent audit, remediation, GitHub App permissions, fail-closed staging proof, owner approval for any signing/activation.
- Automation: PR/issue observation, queue reliability, immutable policy gates, correction cycles, malicious input resistance, cross-product isolation, failure recovery, kill switch, budgets and disposable end-to-end pilot.
- Operations: runbook, observability, staging isolation, supported dependencies, reproducible acceptance, explicit approvals and staged smoke/rollback drill.

## Eight-agent evidence matrix — audit required
| Role | Code entrypoint | Dedicated tests | Integration test | Approved activation |
| --- | --- | --- | --- | --- |
| Project Manager | Issue #118 checklist and safe queue implement some planning/tracking behavior; no dedicated executable role verified | Queue policy/runner tests cover queue, not dedicated PM agent | Unverified | No |
| Solution Architect | `AGENTS.md` architecture constraints; no dedicated executable role verified | Dedicated architect-agent tests not identified | Unverified | No |
| Backend Developer | ACA Node backend exists; Codex manual coding workflow documented; neither proves a dedicated backend agent | ACA CI exists; agent-specific tests not identified | Native automated coding dispatch unproven | No |
| Frontend Developer | ACA dashboard files exist; no dedicated frontend agent verified | Agent-specific tests not identified | Unverified | No |
| QA & Testing | `.github/workflows/ci.yml` and tests implemented; not evidence of an independent QA agent | CI and regression tests documented | Autonomous QA role unverified | No |
| Security Reviewer | Draft PR #21 (`8550ba1317ddb1828471b5228f7f599b6eceecb6`) and issue #22 cover reviewer-related development | Independent audit and final-SHA tests pending | Not independently approved | No |
| DevOps | ACA CI, safe queue, notification workflows implemented; no independent DevOps agent verified | Workflow tests and prior CI evidence | Autonomous operations unverified | No |
| Orchestrator | `src/automation/safeQueuePolicy.js`, `.github/scripts/safe-queue-runner.js`, queue workflow | `test/safe-queue-policy.test.js`, `test/safe-queue-runner.test.js` | Manual native Codex dispatch boundary remains | No |

These entries mean **not verified by this inventory**, not that the code does not exist. Next read-only audit must search relevant branches, PRs and repository paths and record exact links/SHAs. Agent names and the number of workers must never be silently conflated.

## Alphine AI vision, strategy and future prospects — living company roadmap

**Identity and mission:** Alphine AI — *Intelligence for a Connected World*. Build ethical, dependable, security-first AI platforms that help businesses communicate, operate and grow. Founded August 2025; Canadian company with ambitions to serve international markets. Company website: https://alphineai.com.

**Founder-approved direction (2026-11):** Build a reusable, policy-governed autonomous engineering capability that serves the entire Alphine AI product portfolio. Finish Phase 2 only when eight functional engineering agent roles and the essential Agent Manager controls pass independently evidenced acceptance. Then use that engineering team to complete ACA for commercial launch. A second isolated eight-role Engineering Innovation Team will improve agent capabilities and build the full Agent Command Center. Expansion to more instances and specialized company operations agents is a roadmap, not an operational claim.

### Strategic horizons
1. **Now — Phase 2 engineering foundation:** Finish 55 pending acceptance items in Issue #118 (11 of 66 checked at this checkpoint), including eight agent roles, independent security, integrated pilot and Agent Manager enforcement. No premature completion claim.
2. **Next — ACA commercial readiness:** Use verified autonomous engineering team to complete ACA multi-tenant, multi-industry workflows, Twilio/STT/LLM/TTS reliability, security, onboarding, support, billing, monitoring, quality gates and controlled launch. Validate customer demand and service economics before scaling.
3. **Parallel after foundation — Engineering Innovation:** Establish isolated second team with separate queues, credentials, spending limits and audit. Build full visual Agent Command Center and continuously propose/test improvements; no self-modification of production governance without independent review and owner approval.
4. **Growth — product portfolio and markets:** Reuse platform for Alphine AI's other planned products, including attendance/participation verification, social/engagement automation and knowledge orchestration. Evaluate Canadian SMB opportunities and possible Nigeria/Africa pilots with appropriate local data/privacy, telecommunications, payments and language requirements. These are opportunities, not contracted customers or confirmed launches.
5. **Longer term — scalable company operations:** Consider additional supervised agents for customer success, sales operations, research, finance analysis and company administration. Require explicit business case, measurable ROI, access controls and legal/compliance review before activation.

### Company-level operating principles
- Security, privacy, customer trust and least privilege before autonomy; agent compliance means enforceable policy controls plus review, not a guarantee of flawless AI judgment.
- Separate roles, instances and teams; use independent approval and avoid self-certification.
- Keep customer data, repositories, environments, budgets and audit trails isolated by tenant/product/team.
- Track product reliability, response latency, conversion, churn, unit economics, customer satisfaction, security incidents, engineering throughput and agent cost. Set numeric targets only when validated.
- The founder retains authority over mergers, deployments, signing, production secrets, spending commitments and privileged dispatch.

### Founder communications — planned, not active
- Google Workspace exists for the `alphineai.com` domain; `support@alphineai.com` is an example company mailbox, **not** an assumed founder recipient or authorized sending identity.
- Founder report should summarize company vision changes, Phase 2 checklist counts, eight-agent readiness, ACA milestones, risks/blockers, costs, approval requests and upcoming priorities, with GitHub evidence links.
- **Not configured or sent:** founder recipient address, sender identity, Google Workspace Gmail connection, frequency and delivery test all require confirmation/authorization. No claim of email delivery until verified.
- On each material milestone, reconcile Issue #118, this living roadmap, evidence links, and versioned changelog. Recurring proactive reports require an explicitly configured schedule and approved email transport.

## Change-control and execution rules
- No merging, deploying, production/staging mutation, signing, agent dispatch, secrets/security setting changes or spending without the specific required owner authorization.
- A green CI run, isolated CodeQL scan or self-review does not equal independent security approval.
- Make changes on isolated branches with draft PRs; keep ACA-029 PR #2 untouched absent approval.
- When owner says continue, batch safe work to full acceptance and report blockers, not speculative completion.
- For every new chat: read this document + Issue #118, inspect latest relevant PR SHA/CI, then report **verified built / verified tested / pending / blocked / next batch**. Update source of truth alongside accepted changes.
- Proposed expansion after Phase 2: concurrent product orchestration, persistent knowledge, QA/security shared worker pools, budgets, observability and mobile control center; these are roadmap ideas, NOT existing capabilities.

## Verified notification acceptance evidence (2026-11-23T03:07:36.282Z)
- GitHub Actions posted [bot comment #7090423512](https://github.com/alphineaiinc/aca-realtime-gateway-clean/issues/118#issuecomment-7090423512) mentioning `@alphineaiinc`.
- Owner supplied an iPhone screenshot showing a GitHub banner at approximately 10:03 PM Eastern on Sunday 2026-11-22. GitHub Mobile working-hours setting was changed to include all days before the successful test.
- Scope of acceptance: **one end-to-end controlled issue-edit → GitHub Actions bot comment → iPhone push**. Not proof of guaranteed future push, every checklist update, every workflow failure, or cross-repository alerts.
- The preceding self-authored comment was not a valid independent push-delivery test because it was authored by the target account.

## Current Item 12 execution checkpoint (2026-11-23T03:13:02.834Z)
- PR #117 head `befc3093e1f30dd1d23a53bfcfdec6b9f9cf` (draft/unmerged). Changes on PR branch: `tts.js` avoids logging/throwing upstream response bodies and exception text; `test/elevenlabs-transport-security.test.js` adds redaction assertions and credential placement checks.
- **Not yet accepted:** no successful CI or isolated CodeQL run verified on this exact SHA at checkpoint. Preserve Issue #118 TTS behavior checklist as unchecked until final evidence is collected. Independent reviewer signoff is a separate pending acceptance item.

## Item 12 accepted verification checkpoint (2026-11-23T03:49:08.793Z)
- PR #117 remains draft/unmerged at `b80fc83e8bea883023ad075d6e817ff5fa3f7c6f`.
- ACA CI run 45106881883 passed 38/38; isolated CodeQL run 45106881940 executed 89 queries and reported 0 `js/request-forgery` findings, SARIF artifact 14787837134; PR CodeQL evidence run 45106881895 passed.
- Issue #118 mocked TTS behavioral Item 12 is checked. This does not certify automatic provider fallback, independent reviewer acceptance or closure of default-branch CodeQL alert #5.
- Phase 2 tracker: 12 checked, 54 unchecked, 66 total. No merge, deployment, signing, privileged staging changes or agent dispatch.

## Item 13 review-readiness checkpoint (2026-11-23T03:50:10.683Z)
- PR #117 draft exact head `b80fc83e8bea883023ad075d6e817ff5fa3f7c6f`. GitHub review submissions and inline review threads: none returned at inspection.
- Prior evidence: ACA CI 38/38 run 45106881883; isolated CodeQL 89 queries, zero `js/request-forgery` run 45106881940; metadata workflow 45106881895. These are not independent semantic review.
- Preliminary inspection concerns: ElevenLabs catch still logs untrusted `err.code` without validation; request logging includes API-key length. Reviewers must assess these, broader secret/caller-data logging, SSRF boundary, provider behavior, failure handling and scan limitations.
- **Item 13 stays unchecked.** Requires genuinely independent reviewer, recorded findings/disposition, correction if needed, exact-final-SHA CI/security scans, and review signoff. Do not conflate author/self-review with independence.

## Reference evidence
- [Issue #118](https://github.com/alphineaiinc/aca-realtime-gateway-clean/issues/118)
- [Safe development pilot](docs/development-automation.md)
- [Dispatch boundary](docs/codex-dispatch-feasibility.md)
- [Agent policy](../AGENTS.md)
- [PR #21](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/21), [PR #115](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/115), [PR #117](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/117)
