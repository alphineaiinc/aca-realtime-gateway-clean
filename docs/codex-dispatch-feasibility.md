# ACA-AUTO-002: Codex Dispatch Feasibility and Safe Queue

This document records the Level 2 Phase 1 feasibility result for issue `#14` and the fallback-safe queue implemented in this repository.

## Decision Summary

- Native coding-task dispatch to the GitHub/Codex coding agent was **not proven** via a documented, supported API in this repository context.
- The implemented path is a **supported fallback**:
  - automatic issue eligibility + queue evaluation
  - explicit single-active-task lock
  - idempotent audit comments
  - fail-closed behavior
  - manual native agent dispatch boundary (`Assign agent` in GitHub UI remains human-driven)

No fake completion claims are made for native programmatic dispatch.

## Evidence Inventory: Supported Interfaces vs UI-only Boundary

### Verified repository artifacts

- CI workflow: `.github/workflows/ci.yml`
- Safe queue workflow: `.github/workflows/safe-codex-queue.yml`
- Queue policy code: `src/automation/safeQueuePolicy.js`
- Queue workflow runner: `.github/scripts/safe-queue-runner.js`
- Queue tests: `test/safe-queue-policy.test.js`

### GitHub interfaces and results captured during this issue

- GitHub Actions workflow execution and logs are supported and accessible through Actions APIs/tools.
- GitHub issue automation primitives are supported (issue events, labels, comments, assignees).
- Available automation trigger inventory includes issue triggers (`issues`, `issue_labeled`, `issue_assigned`, etc.).
- Available automation tools inventory does **not** expose a direct, documented `create coding task` native Codex-dispatch API in this execution context.
- Repository automation listing endpoint returned `404` in this context, so no enabled native automation object could be confirmed for agent dispatch.

### Documented boundary for this implementation

- `Assign agent` remains a UI-mediated step in this phase.
- Adding plain assignee `Codex` is treated as a manual-dispatch request signal only; it is not treated as proof a coding task session started.

## Minimal Permissions and Security Boundaries

Workflow file: `.github/workflows/safe-codex-queue.yml`

Permissions:
- `contents: read`
- `issues: write`
- `pull-requests: read`

Security boundaries:
- No token elevation; only default `GITHUB_TOKEN` workflow scope.
- No secrets added.
- No production systems touched.
- No deployments, migrations, billing changes, or external customer actions.
- No transcript or customer data logging.

## Fallback Architecture (Implemented)

### Trigger

- GitHub `issues` events: `opened`, `reopened`, `labeled`, `unlabeled`, `assigned`, `unassigned`, `closed`.

### Eligibility and allowlist

- Allowlisted scope for proof: issue must include label `aca:auto/docs-test`.
- Non-allowlisted issues are blocked and labeled `aca:auto/blocked`.

### Single active task lock

- Uses open issue label `aca:auto/active` as lock signal.
- If another open issue already has this label, new candidates fail closed with reason `active_issue_lock`.

### Idempotency and audit trail

- Decision comments include deterministic marker:
  - `<!-- aca-auto-queue:v1:<issue_number>:<decision_code> -->`
- Existing marker prevents duplicate comments for the same decision.
- Decision labels and comment history provide an auditable trail.

### Manual step (remains manual by design)

- Human performs native dispatch in GitHub UI (`Assign agent`) when available.
- On `Codex` assignment signal, the queue marks `aca:auto/manual-dispatch-requested` and lock label `aca:auto/active`.
- This state means "manual dispatch requested", not "native session confirmed".

### Fail-closed behavior

- Closed issues have automation labels removed.
- Missing allowlist, non-open state, PR payloads, or active-lock conflicts block progression.

## Costs and Usage Control

Current controls in this phase:
- Restrict automated handling to allowlisted docs/test issues.
- Enforce one active issue lock to avoid duplicate parallel sessions.
- Avoid auto-retry loops and auto-dispatch to limit accidental spend.

Operational cost note:
- Native coding-session usage cost remains tied to manual agent assignment; automation here does not create native sessions autonomously.

## Expansion Path (for #4 follow-on)

1. Add explicit state machine labels (`queued`, `dispatched`, `pr_opened`, `ci_failed`, `ready_for_review`) with invariant checks.
2. Add bounded retry counters and cool-down windows for transient CI/review failures.
3. Add owner-approval gate labels before merge/deploy actions.
4. Add explicit PR-link tracking and stale-lock recovery policy.
5. Replace manual dispatch boundary only if/when a documented native dispatch API is available with least-privilege auth.

## Validation Performed

- Policy unit tests validate:
  - allowlist enforcement
  - single-active lock behavior
  - manual dispatch request state
  - fail-closed closed-issue handling
- Workflow behavior is constrained to labels/comments/locking and does not perform code execution dispatch.
