# Phase 2 — PR Supervision (Slice A: read-only policy)

Related: [Issue #20](https://github.com/alphineaiinc/aca-realtime-gateway-clean/issues/20), parent [#4](https://github.com/alphineaiinc/aca-realtime-gateway-clean/issues/4), merged Phase 1 [PR #15](https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/15).

## Implemented in Slice A
`src/automation/prSupervisionPolicy.js` is a pure decision function with fixture tests. **No GitHub Action is added and nothing executes autonomously in Slice A.** All inputs must come from verified current-state GitHub API reads in future slices; the evaluator does not itself establish provenance. It never claims to launch native Codex, approve a merge, deploy, or confirm a Codex session.

Inputs are a verified eligible issue, explicitly linked PR, same-head required CI checks and an independent trusted review, plus an existing correction ledger. The caller must provide accurate `trustedHead` / `trustedLink`, authenticate review origin, identify required check names from branch rules, and bind results to current head commit. PR body, comments and labels are **not** trusted reviewer evidence. A conventional GitHub PR review approval is not necessarily evidence of the independent Codex review. Until all these claims are validated, keep the caller read-only and mark evidence missing.

States: `unlinked` / `awaiting_manual_dispatch` (reserved for future issue-oriented orchestration), `awaiting_pr`, `ci_pending`, `ci_failed`, `review_pending`, `correction_needed`, `blocked`, `ready_for_human_approval`, and `closed`. Readiness is **not permission to merge**.

## Next slices — unimplemented design
- Observe `pull_request` (opened, reopened, synchronize, ready_for_review, closed), `pull_request_review` (submitted, dismissed), `check_run` (completed), `workflow_run` (completed) and optionally `issue_comment` only as a wake-up hint. Never treat user content as commands. GitHub filters may omit bot-triggered events.
- Scheduled reconciliation and a restricted `workflow_dispatch` repair trigger must enumerate open monitored PRs. Re-fetch PR/issue association, SHA, current checks, trusted review and correction ledger live. Events are hints, not authoritative state. A replaced pending Actions run must not cause permanent stale status.
- Use least-privilege `contents:read`, `pull-requests:read`, `checks:read`, `actions:read`, `issues:read` for the observation step; separate privileged audit-comment writer if reviewed and explicitly enabled. Never check out or run untrusted PR code in a privileged event. Avoid `pull_request_target` code execution.
- Per-PR concurrency plus a periodic sweep; do not count on `cancel-in-progress:false` to retain pending events. Replay idempotently using marker scoped to repo, PR, head SHA, policy version, decision fingerprint and correction attempt. Revalidate head immediately before any write.
- Corrections: at most **2** requests per logical issue/PR; do not reset budget after a head push/rebase, and halt after an unchanged failure. Suggestions only, unless a supported agent-dispatch interface is independently verified and explicitly authorized. No infinite loop. Agent assignment does not prove a running Codex task.
- Escalate missing CI, stale review, transient GitHub API errors, an unverified Codex verdict, suspicious provenance, timeouts, or budget exhaustion to human owner rather than guessing.
- Avoid overlaps with pending Phase 1 queue follow-up PR #17.

## Validation and rollback
Run `node --test test/pr-supervision-policy.test.js` and `node --check src/automation/prSupervisionPolicy.js`. Existing `ACA CI` should validate the complete PR against main. Revert the unmerged PR/branch to roll back Slice A. A future observer workflow must ship in disabled/dry-run mode until explicit acceptance and must remain separate from production ACA.
