# Phase 2 authenticated GitHub workflow record audit — 2026-11-21

Authenticated GitHub connector queries for commit `d60c8b360d00925d3fb85c4eb86b9a67e976553b` returned:
- `ACA CI` run `44958922280`, workflow ID `422174901`, completed/success; jobs `Node tests` `137013146479` and `PostgreSQL ledger integration` `137013146658`, completed/success.
- `ACA PR Supervision Event Observer` workflow ID `425662943`; returned successful run IDs `44958981626`, `44958923342`, `44958922276`.
- Draft validation PR #90 closed unmerged.

**Critical evidence gap:** The available authenticated connector's run summary exposes ID, name, workflow ID, status, conclusion, run number and API job/log URLs, but **does not expose** repository ID, head SHA, event, check_suite_id or run_attempt. Job summaries do not expose head SHA or the check-run GitHub App identity. The wrapper is first-page and PR-trigger-filtered; it is not an exhaustive paginated evidence collector.

The code audit confirms `verifiedCiEvidence.js` expects pinned App and workflow ID and `ciWorkflowRunBinding.js` expects check-suite binding. Neither requirement can be marked verified solely from these connector summaries. **Do not conflate GitHub workflow success with trusted CI provenance.**

Added `phase2LiveGithubRunBinding.js` as an intentionally non-authorizing strict evidence-shape gate and tests for missing/mismatched fields; even a complete synthetic input never authorizes execution. To close the gap, use an authenticated GitHub API integration with exhaustive pagination and independently pinned App/workflow configuration; verify repository, PR head, check suites, run attempts and reruns before independent reviewer attestation. No credentials were created.

**Disposition:** Live workflow IDs/results observed; complete trusted GitHub provenance remains NO-GO. No merge, deploy, signing, dispatch or production change.
