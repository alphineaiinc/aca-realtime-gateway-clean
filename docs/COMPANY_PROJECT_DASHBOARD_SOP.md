# Alphine AI — Company-wide project dashboard SOP addendum

Version 1.0 | Owner instruction: November 25, 2026 (America/Toronto) | Draft repository adoption; conversational reporting effective immediately.

Applies to every Alphine AI product, project and coordinated development batch. Supplements SDP-001/002 and existing project procedures; does not override MOAA, safety, owner authorization, independent custody, OLR-011/012 or release gates. No protected operation or new scope is authorized by this document.

## Required reporting

- Show overall completion and one progress bar for every approved workstream, with names, baseline, current values and percentage-point delta. Identify denominator, weighting and evidence date. Preserve approved scope; do not invent missing values or silently reset baselines.
- Distinguish provisional engineering estimates, permanent acceptance counts, test evidence and actual operational acceptance. Never treat implementation, passing CI or a code review as deployment or independent operational clearance. Only credit evidenced milestones; explain any regression or changed estimate.
- Report batch work actually completed, commits and exact SHA checks, tests and findings, independent review, remaining gates, blockers, owner decisions and next coherent batch. Link verifiable evidence. Label pending, unknown and unverified status explicitly.
- Show additional CAD cost, authorized scope, and protected-operation status. Preserve frozen candidates and project separation. Report no unauthorized merges, deployments, credentials, signing or live dispatch only when supported.
- End conversational execution reports with a Proceed control while work remains; it submits a new request within existing authorization, not background execution or automatic approval. Retain daily reporting requirements from SDP-001 v1.1.

## Mandatory project-boundary gate (LL-SCOPE-001 / OLR-012)

Owner instruction 2026-11-25: prevent cross-project scope drift. Effective conversational procedure; repository adoption pending. Incident: [LL-SCOPE-001](https://github.com/alphineaiinc/aca-realtime-gateway-clean/issues/118#issuecomment-7180707655), verified central lessons register entry.

Before any recommendation, batch, repository write or Proceed control:
1. Identify the active project charter, approved task IDs, action purpose, target repository/branch/path, and existing authorization. Shared repository ownership, product relevance and prior assistant-generated prompts do not establish project authority.
2. Compare action against charter and approved scope. Stop on mismatch or ambiguity; do not execute an out-of-project write. If blocked, preserve HOLD or advance genuinely authorized work within that project. A cross-project transfer must be explicitly owner-directed and executed in the appropriate project context.
3. Consult applicable lessons and validate proposed Proceed text and final report against the same scope. Do not count another project's work toward this project's progress.

Development Automation is the Manager/eight-agent cross-product engineering automation programme, not individual product implementation. ACA product commercial development belongs in its separate project. Automation work in the shared repository remains eligible only under existing task IDs and authorization.

| Boundary regression case | Required result |
|---|---|
| Development Automation + ACA marketplace write | DENY |
| Shared repository + approved S3 automation task | Eligible subject to existing gates |
| Stage 3 HOLD + product backlog | DENY |
| Assistant-generated out-of-scope Proceed prompt | DENY |
| Explicit owner-directed cross-project transfer | Route to correct project; no automatic write |

This is a procedural control and regression specification, not an assertion of machine-enforced isolation. Preserve Stage 2 separation, 44 tasks, independent custody, MOAA, SDP-001/002, OLR-011/012 and CAD0. No expansion of authority.

## Stage 3 example

Batch 47 baseline: S3-01 Manager/eight-agent integration 90%; S3-02 secure environment 80%; S3-03 independent reviewer operational acceptance 68%; S3-04 controlled dispatch 78%; S3-05 individual operational testing 50%; S3-06 integrated lifecycle 75%; S3-07 stop/recovery/cost/approval 75%; S3-08 handover 30%. Equal-weight mean 68.25%, provisional engineering estimate. Source: master plan commit 5a5c063dd8531005c7dc66d911202757eb289c6b. Permanent baseline 44 tasks (7 C, 24 D, 3 O, 10 B); operational agents 0/8. These are historical values, not newly verified acceptance. Stage 2 remains separate.

## Change control

This addendum records the owner-approved reporting format, not changes to execution authority, acceptance criteria, budgets or task scope. Repository adoption remains subject to normal review and explicit merge authorization. Other repositories may reference the approved addendum; no claim of automatic propagation or settings enforcement.
