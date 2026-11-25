# Consolidated independent review request — B02

Prepared for owner submission to an independent reviewer. Review only, CAD $0 additional spend, no dispatch, signing, credentials, merge or deployment. No review was initiated by this document.

| PR | Exact head | Existing CI | Review scope |
|---|---|---|---|
| #21 | 6573bee1c668742259beee6768a5f91fc86090d9 | 45497692213 / 45497692429 / 45497692543 | Reviewer identity, signed evidence, trusted transport, observation permissions, stale evidence, bounded correction |
| #142 | 1232e0590486f386cccc51b340b0b74cc4d5d288 | Exact-head CI 45535413496 completed/success; prior 45530365562 passed historical head | Role isolation, durable queue, approvals, incident recovery, budget, replay, publication evidence, all activation manifest code |
| #146 | 90973dbc0a4355aaebb67112350974a8ad0b4914 | 45496287714 | Protected sandbox provenance, five authenticated fault outcomes, fail-closed teardown |
| #150 | acd60d56916df8ed061cf3b454839a7b6c3aa5fb | 45494930061 | Test-only queue API-error and single-lock regression; verify no runtime changes |

Verify each head before reviewing. Return reviewer identity, exact SHA, reviewed files, findings and severity with source locations, reproduction or reasoning, test evidence and explicit disposition. No approval inferred from CI or advisory review.

## #142 historical Copilot findings to reconcile

Review submitted 2026-11-24 12:42:53 UTC, COMMENTED, six reported open issues; activationManifest.js not reviewed. Do not assume these findings are all new to the current head. Current source inspection shows captured SQL scope and expected identity key in durableApproval.js; incident ID binding and locked target in governanceRecovery.js; pinned scope and bound input in policyBoundQueue.js. Independent confirmation remains necessary. CI event receipt schema must be checked against product identity. changePreparation.js still uses a process-local consumed flag: assess durable outer admission and restart replay; do not activate. Do not mark threads resolved without exact-head evidence.

CI event schema declaration not located by exact search; verification outstanding.

## Owner decisions
Select an independent reviewer with existing available subscription/authority, approve review-only scope if needed, supply current CodeQL export/settings evidence. Separate future authorization required for protected trust provisioning, isolated staging acceptance and integration. No blanket approval. B01 gates remain.

## Superseding historical finding reconciliation — 2026-11-24
All six reported Copilot findings have existing source-level corrections identified, not independent clearance. Findings 1–2: durableApproval.js snapshots SQL parameters and expected identity key before awaiting authentication. Finding 3: governanceRecovery.js binds incident ID in digest, locks exact target, and checks target ID for deletion. Finding 4: policyBoundQueue.js validates and pins facade input scope. Finding 5: migrations/draft_engineering_team_queue.sql defines engineering_team_ci_events PRIMARY KEY(product,repository,workflow_id,run_id,attempt). Finding 6: engineering_team_preparation_attempts persists one row per workflow; fixtureRuntime calls workflowLedger.beginPreparation before prepare, returns reconciliation for started and digest-verified stored evidence for completed; changePreparation alone remains an offline helper with local consumed guard. Existing completed restart regression retained. New regression commit 1232e0590486f386cccc51b340b0b74cc4d5d288 adds real disposable PostgreSQL assertions for cross-product CI delivery and concurrent/unknown durable preparation admission. The unknown-attempt test seeds next_step=8 directly in fixture DB to isolate admission, not to claim full-path crash reproduction. No source rewrite needed for these two findings; independent reviewer must verify all six on the new head and remaining trust gates. No threads marked resolved.

## Final development checkpoint
#142 1232e0590486f386cccc51b340b0b74cc4d5d288: ACA CI 45535413496 completed/success, job 138940687872 Node tests and isolated engineering queue PostgreSQL integration both successful. No further source correction indicated by CI. Six historical findings await independent exact-head confirmation. No review dispatched; no operational clearance.
