# Alphine AI — Phase 2 Standard Development Procedure (SDP-001)

**Version:** 1.1 (proposed)  
**Scope:** Every remaining Phase 2 checklist item in issue #118 and related work in the Alphine AI automated engineering platform, regardless of repository or product.  
**Authority:** Owner approvals and higher-priority safety/security restrictions always override this procedure.  
**Status:** Development-stage procedure; adoption in `main` requires normal PR approval/merge. Until then use the draft version as the working checklist, not as an enforced GitHub branch rule.

## Non-negotiable rules
1. **Evidence before status.** Never mark an item complete, or report an alert fixed, based solely on a code change, passing unit test, or estimated percentage. Cite the exact commit, test run, scope, limitations, and acceptance evidence.
2. **Least privilege and no surprise side effects.** No merge, production or staging deployment/activation, signing, native agent dispatch, secret creation/rotation, security-settings changes, production data writes, or costs without the owner's specific authorization for that action. Prior approval for one action does not authorize another. Keep drafts unmerged by default.
3. **Fail closed.** On uncertainty about identity, tenant, permissions, credentials, environment, verification or workflow state, stop the risky operation and record a blocker; never invent a fallback identity, signing secret, approval or success.
4. **No fabricated evidence.** Distinguish source review, mocked tests, integration tests, staging tests, isolated scanners, and default-branch production evidence. A green workflow is not an independent audit. Recheck when head SHA changes.
5. **Bounded autonomous iteration.** Work in substantial coherent batches; diagnose and repair failures within authorized scope. Avoid endless retries or repeated tiny commits. Escalate when the change is risky, requires new credentials/permissions, has unresolved architecture choices, or remains blocked after two focused correction attempts.
6. **Keep ownership clear.** Author/self-review and AI/CI feedback do not substitute for an independent security reviewer where required by the release gate.
7. **No silent scope creep.** Log new vulnerabilities, dependencies and regressions separately; prioritize high-risk findings and assess whether they block the current item.

## Per-item lifecycle — execute in order, for EVERY item

### Gate 0 — Intake and baseline
- Read issue #118 and the item's linked issue, PRs, dependencies and latest exact branch heads; check live state before acting.
- Record item ID, outcome, affected products/tenants, baseline evidence, threat/risk tier, existing failures, prerequisites, approvals, and explicit exclusions.
- Split large items into cohesive sub-batches with independent testable deliverables. Avoid counting an alert twice or equating historical alert counts with live counts.
- Define measurable acceptance criteria **before** implementation and identify the evidence source for each.

### Gate 1 — Design and safety check
- Trace relevant request/data flows, authentication and authorization, tenant boundaries, external services, secrets, retries and failure modes.
- Decide on compatibility, rollback, feature flags and migration requirements. For high-risk paths, document abuse cases and the negative tests that must pass.
- Verify permitted environment, read/write scope, budget and user approvals. If any protected action is needed, pause only that action and continue other safe work.

### Gate 2 — Batch implementation
- Prefer one coherent draft PR per independently reviewable concern. Do not combine unrelated security changes or accidentally overwrite concurrent PR branches.
- Implement the complete planned batch, including tests and documentation, before requesting owner attention. Use deterministic, bounded and idempotent operations where applicable.
- Never include secrets, customer data or unredacted sensitive logs in commits, PRs, issues or tool output.

### Gate 3 — Validation and correction loop
- Run available syntax/lint/unit tests, negative/security tests, and relevant integration tests. For distributed behavior, exercise concurrency/multi-instance conditions when feasible.
- Inspect GitHub Actions on the **exact latest head SHA**. If failing, read the failing job logs, fix root cause, rerun and verify again. A pending or missing run is **PENDING**, not PASS.
- Run relevant CodeQL/dependency scans when available. Isolated scans do not prove default-branch alerts closed; document tooling gaps.
- Check that tests would fail for the original bug, avoid purely self-confirming string assertions, and verify no regression of tenant isolation or fail-closed behavior.
- If validation cannot be performed, explicitly record **UNVERIFIED** with reason and release impact.

### Gate 4 — Independent review and acceptance evidence
- Review the final diff, changed dependencies, auth boundaries, error paths, logs, rollback and any high/critical findings. Obtain genuinely independent review when the acceptance/release gate requires it.
- Record per criterion: PASS / FAIL / BLOCKED / NOT TESTED, exact SHA, run/job/artifact IDs, environment, timestamp, reviewer and limitations.
- For historical security alerts, record each unique alert ID, original location/rule, risk disposition, remediation PR, final SHA and **live default-branch** status after an authorized merge; do not dismiss or close without evidence.

### Gate 5 — Status and handoff
- Update the linked item and master issue #118 with evidence, remaining gaps, dependencies, next batch, and any owner decision required. Preserve existing issue text and avoid overwriting concurrent edits.
- Report compactly: completed changes, exact PR/SHA, CI status, blockers, owner actions and what happens next. Do not report invented completion percentages.
- An item is **DEVELOPMENT-READY** only when all development acceptance criteria pass on its final draft head; **RELEASE-READY** only after independent/security/staging gates pass; **COMPLETE** only after all item-specific acceptance criteria and authorized release/closure requirements pass.
- Move to the next unblocked item without waiting for repeated 'Proceed' messages within the current active work session. Do not claim asynchronous work outside an actual scheduled automation.

## Required per-item record (copy into issue or PR)

```md
### SDP-001 Item Record
Item / owner / linked issues & PRs:
Outcome and measurable acceptance criteria:
Risk tier / affected tenant boundaries / prerequisites:
Authorized scope and forbidden operations:
Baseline / source of truth / snapshot date:
Batch plan and rollback:
Exact final head SHA:
Validation (test, run/job, scanner, environment):
Security & independent review evidence:
Criteria: [PASS | FAIL | BLOCKED | NOT TESTED] with references:
Residual risk and operational limitations:
Status: NOT STARTED | IN PROGRESS | BLOCKED | DEVELOPMENT-READY | RELEASE-READY | COMPLETE
Next unblocked batch / specific owner decision:
```

## Consistent progress accounting
- Track **criteria passed / total criteria** only where criteria are defined and comparable. Label estimates as estimates, never as measured progress.
- Track separately: development readiness, security review, integration/staging validation, owner release authorization, and default-branch closure.
- When an item has no verified acceptance evidence, do not label it complete even if implementation is advanced.
- Maintain a dependency order that favors high-risk security blockers and the shortest safe path to end-to-end nonproduction automation, without bypassing gates.

## Stop / escalation conditions
Immediately stop the affected operation on: potential production impact; tenant isolation/auth bypass; exposed secrets; unexpected external writes or charges; unclear owner authorization; stale head SHA; invalid or unverifiable test evidence; destructive migration; repeated unexplained CI failures; or reviewer conflict of interest. Preserve diagnostics without secrets, record a blocker, and continue unrelated safe tasks.

## Change control
Any exception or revision to SDP-001 must be documented with rationale, risk, owner authorization when needed, and version increment. A conversational instruction to 'proceed' never waives safety or release gates. All future Phase 2 items should link this document and use its item record.

## Mandatory daily delivery reporting and scope freeze
Use docs/MASTER_PROJECT_COMPLETION_PLAN.md as the fixed 44-item acceptance baseline. Proceed means execute the next coherent authorized batch in dependency order, record actual evidence and retain the denominator. No new requirements without owner-approved change control; defects stay under existing IDs. At the owner's Goodnight message, close the day's working session with a consolidated America/Toronto calendar-day report: executive summary, start/end accepted and implementation-evidence counts and percentages, percentage-point deltas, permanent IDs newly accepted or advanced, actual commits/tests/CI, phase-wise status, blockers and decisions, additional CAD spending, remaining effort forecast and next day's batch. Distinguish verified daily changes from unknown baseline history; do not fabricate deltas or equate code with acceptance. Good morning resumes the last checkpoint; Status reports the master baseline. Include a Proceed control in conversational development reports while work remains. This is reporting only, not authorization for protected operations or background execution.

## Companion universal reporting standard
Use [SDP-002 v1.0](standards/SDP-002-UNIVERSAL-DEVELOPMENT-REPORTING.md) for cross-project execution and reporting. All SDP-001 gates, restrictions, fixed 44-item automation baseline and independent acceptance requirements remain unchanged. Owner approved working adoption subject to compatibility verification; draft integration remains separately authorized.
