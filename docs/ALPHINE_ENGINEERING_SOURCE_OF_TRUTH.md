# Alphine AI — Engineering Source of Truth

Status: **proposed baseline, awaiting owner review and merge**. Updated 2026-11-22. Repository: `alphineaiinc/aca-realtime-gateway-clean`.

## Document versioning policy

- Version: **v1.1.0-draft**. Baseline: v1.0.0-draft. This document is currently proposed in PR #121, not merged.
- Every material update MUST increment the document version, add a new append-only change-log entry with an ISO-8601 UTC timestamp (YYYY-MM-DDTHH:mm:ssZ), identify **Added / Changed / Removed / Verified / Still unverified**, and link the PR, commit SHA and evidence.
- Use the Git commit's authoritative timestamp when an exact timestamp is required; never invent one. Draft entries can state the calendar date and Git-commit timestamp reference until the exact time is retrieved.
- Never rewrite or delete historical entries to conceal a change. Correct inaccuracies with a new entry explaining the correction. Git history remains the underlying immutable revision trail, subject to repository permissions.
- Versioning: major = approved architecture/boundary change; minor = new capability or substantive scope addition; patch = documentation/evidence/status correction. Proposed changes remain draft until approved and merged.
- Maintain this document and the Phase 2 tracker together; reconcile version, evidence and checklist status in the same PR when relevant.

## Append-only change log

| Version | Timestamp | Added | Changed | Removed | Verification / reference |
| --- | --- | --- | --- | --- | --- |
| v1.0.0-draft | 2026-11-22; Git commit timestamp | Initial eight-role baseline, implementation inventory, acceptance tracker links, safety gates | Reconciled claimed agent count with evidence status | None | Commit `6861f165e2f054cac24dc9886a8c8f6c17f60d0f`; PR #121; eight executable roles not yet audited |
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

## Evidence-backed implementation inventory
| Component | Evidence | Current classification |
| --- | --- | --- |
| Agent contribution rules | `AGENTS.md` | Implemented policy instructions; not a standalone agent |
| ACA CI | `.github/workflows/ci.yml`, `docs/development-automation.md` | Implemented; prior CI evidence documented |
| Safe issue queue | `.github/workflows/safe-codex-queue.yml`, `src/automation/safeQueuePolicy.js`, `.github/scripts/safe-queue-runner.js` | Implemented with tests; native Codex dispatch **manual** |
| Coding agent / Codex | `docs/development-automation.md`, `docs/codex-dispatch-feasibility.md` | Manual UI assignment/review documented; automatic native coding-session dispatch unproven |
| Security reviewer | Issue #22 and draft PR #21 | Under independent security audit; not approved for privileged operation |
| Phase 2 completion notifications | PR #119, PR #120, `.github/workflows/phase2-item-notifications.yml` | Merged workflow; iPhone push delivery not yet verified |
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
| Project Manager | Not yet mapped | Not yet mapped | Not yet verified | No |
| Solution Architect | Not yet mapped | Not yet mapped | Not yet verified | No |
| Backend Developer | Not yet mapped | Not yet mapped | Not yet verified | No |
| Frontend Developer | Not yet mapped | Not yet mapped | Not yet verified | No |
| QA & Testing | Not yet mapped | Not yet mapped | Not yet verified | No |
| Security Reviewer | Not yet mapped | Not yet mapped | Not yet verified | No |
| DevOps | Not yet mapped | Not yet mapped | Not yet verified | No |
| Orchestrator | Not yet mapped | Not yet mapped | Not yet verified | No |

These entries mean **not verified by this inventory**, not that the code does not exist. Next read-only audit must search relevant branches, PRs and repository paths and record exact links/SHAs. Agent names and the number of workers must never be silently conflated.

## Change-control and execution rules
- No merging, deploying, production/staging mutation, signing, agent dispatch, secrets/security setting changes or spending without the specific required owner authorization.
- A green CI run, isolated CodeQL scan or self-review does not equal independent security approval.
- Make changes on isolated branches with draft PRs; keep ACA-029 PR #2 untouched absent approval.
- When owner says continue, batch safe work to full acceptance and report blockers, not speculative completion.
- For every new chat: read this document + Issue #118, inspect latest relevant PR SHA/CI, then report **verified built / verified tested / pending / blocked / next batch**. Update source of truth alongside accepted changes.
- Proposed expansion after Phase 2: concurrent product orchestration, persistent knowledge, QA/security shared worker pools, budgets, observability and mobile control center; these are roadmap ideas, NOT existing capabilities.

## Reference evidence
- [Issue #118](https://github.com/alphineaiinc/aca-realtime-gateway-clean/issues/118)
- [Safe development pilot](docs/development-automation.md)
- [Dispatch boundary](docs/codex-dispatch-feasibility.md)
- [Agent policy](../AGENTS.md)
- [PR #21](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/21), [PR #115](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/115), [PR #117](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/117)
