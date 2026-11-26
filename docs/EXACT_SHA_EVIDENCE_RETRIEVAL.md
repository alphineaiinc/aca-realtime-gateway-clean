# Alphine AI — Exact-SHA GitHub evidence retrieval

Version 1.0 | Batch 53 | Draft SOP companion; applies to all Alphine AI projects, subject to existing permissions and adoption controls.

## Read-only procedure
1. Establish repository, PR number, expected full 40-character head SHA and base SHA. Verify current PR metadata and stop on mismatch. Preserve draft status and frozen candidates.
2. Use the authorized GitHub GET transport for `https://api.github.com/repos/{owner}/{repo}/actions/runs?head_sha={sha}&per_page=100`. The narrower PR-triggered workflow helper is not exhaustive. Follow pagination when needed; verify returned SHA, event, run ID, status and conclusion. Include push and dynamic runs; do not infer success from missing results.
3. Retrieve individual run jobs using `/repos/{owner}/{repo}/actions/runs/{run_id}/jobs` or the supported jobs helper. Verify exact revision association, latest attempt and individual required job conclusions; retrieve test logs only as needed. Record passes, failures, skips and separate database executions; never double count repeated runs.
4. Retrieve `/repos/{owner}/{repo}/commits/{sha}/check-runs` through authorized GET. Inspect head SHA, check provider, name, conclusion, summary and annotations. Dynamic CodeQL jobs and the GitHub Advanced Security aggregate check are distinct evidence. A successful aggregate with no new PR alerts does not prove all repository alerts are closed. Follow pagination and retain links and observation timestamps.
5. Empty legacy commit-status responses are not proof of absent checks. If a transport denies access, report evidence unknown and use another authorized read path; do not bypass permission restrictions, provision credentials or repeatedly ask for links already discoverable.
6. Keep independent review, operational acceptance, identity custody, budget and release authority separate. No GET result authorizes mutation, merge, deployment, signing or dispatch.

## Verified example
PR #159 exact head `1d3e07fb8c01582c3c3fac62b1a618afb29a0a6a`: PR CI 45729392670, push CI 45729387028, dynamic analysis 45729387975, Advanced Security check 139607534794 (success, no new alerts in PR changes). Primary suite 467 passed, zero failed, four skipped; four separate database executions passed. Evidence recorded in PR #159 comment 7178894153. These are historical exact-head facts, not automatic approval of future revisions.

## Governance
Companion to COMPANY_PROJECT_DASHBOARD_SOP.md. Preserve MOAA, SDP-001/002, OLR-011/012, independent custody and scope. Reporting guidance only; no changes to runtime, repository settings or protected operation authority. CAD $0 additional purchases.
