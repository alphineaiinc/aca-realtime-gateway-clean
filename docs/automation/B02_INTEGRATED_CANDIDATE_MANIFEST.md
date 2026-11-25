# B02 integrated candidate preparation — exact revision manifest

2026-11-24 | P2-23 | SDP-001 v1.1 | Preparation only; no integrated candidate has been built or accepted. No merges, rebases, deployment, migrations, credential provisioning, signing or dispatch. CAD $0.

## Pinned inputs
GitHub PR metadata and base-to-head compare inventories were retrieved for these drafts. Base SHA is the reported comparison base, not a claim that all drafts share the current main tip. CI identifiers below are previously verified evidence for the listed heads where available; no reruns.

| PR | Exact base | Exact head | Changed paths returned | Prior CI evidence |
|---|---|---|---:|---|
| #21 | d5bbdf5304d5cd0f0fdd73e02a2c4991d609a8df | 7fec24c78f926d05abc66d3fc82d6a957d54f364 | historical 79; refresh at integration | 45546642503, 45546642362, 45546642615 (success) |
| #115 | d5bbdf5304d5cd0f0fdd73e02a2c4991d609a8df | 2a47fb399b63aebfdc7f5d2bc37afe834623e4f4 | 8 | 45092325442, 45092325535, 45092325512 |
| #117 | d5bbdf5304d5cd0f0fdd73e02a2c4991d609a8df | 355cefaaf4792ed1ac5382e38163e7b9ee0b9c66 | 6 | 45112869457, 45112869419 |
| #121 | 02395a18092277a8cb65e0d5b4bdb26c3ae5dac2 | 242da162a89db95bd950d64f32a69e930fc33327 | 1 | not established in current evidence |
| #122 | 02395a18092277a8cb65e0d5b4bdb26c3ae5dac2 | 004ae42c63b9a7ef235d18df15a5377ec2817709 | 14 | 45293583771 |
| #123 | 02395a18092277a8cb65e0d5b4bdb26c3ae5dac2 | bc7fd10c2aecbf928f5879b1b8af573292cedfa1 | 8 | 45495110527 |
| #124 | 02395a18092277a8cb65e0d5b4bdb26c3ae5dac2 | 35610244314b70bde24491a2a0e42a49a3a01e1d | 9 | 45294328363 |
| #125 | 02395a18092277a8cb65e0d5b4bdb26c3ae5dac2 | 46b534a2031b82dd50a496ae6eb30dbc8cbcd34f | 31 | 45293298561 |
| #126 | 02395a18092277a8cb65e0d5b4bdb26c3ae5dac2 | 1e9832502965270bdaeb75cb8f5b3980759e0302 | 2 | not established; documentation only |
| #142 | 02395a18092277a8cb65e0d5b4bdb26c3ae5dac2 | 5a9de1e2f29ea34803733623b4f81e1fb04913f1 | historical 115; refresh at integration | 45545763831 (success) |
| #146 | 02395a18092277a8cb65e0d5b4bdb26c3ae5dac2 | 90973dbc0a4355aaebb67112350974a8ad0b4914 | 17 | 45496287714 |

#15 merged; #17 superseded for recovery source by #15. Do not merge #17. #150 test-only regression already accepted and squash-merged as 3f3e22948b3ac7ec809332196a016c1347c39d14; exclude from reintegration. #126 pin is the input snapshot preceding this document commit; use a separately recorded later documentation head when reviewing it. No claim of common-ancestor or mergeability verification.

## Shared changed paths
These are observed overlaps, not proven textual conflicts. Reconcile each against the selected base and preserve both required behaviors; never resolve by silently dropping a security change.

| Path | Draft PRs |
|---|---|
| .github/workflows/ci.yml | #21, #122, #124, #125, #142 |
| src/brain/utils/emailer.js | #115, #122 |

## Proposed dependency order (design, not authorization)
1. Preserve merged #15 and #150 without reintegration; adopt #121/#126 procedures subject to owner approval.
2. Reconcile security cohorts #115/#117/#122–125 with ACA product candidate and current CodeQL evidence; preserve shared ingress controls and verified auth behavior. Do not assume alert clearance.
3. Integrate #21 policy/observer/reviewer source with #142 Manager source and #146 protected sandbox source; reconcile CI jobs, migration source, interfaces and dependency pins before any approved integration. Actual reviewer/signer and sandbox trust are independent external gates, not provided by source combination.
4. On an explicitly authorized isolated integration branch, verify exact common base, compare complete diffs, resolve overlaps, preserve all negative tests, and run full CI/CodeQL and disposable PostgreSQL checks. No production access or protected runtime execution without separate authorization.
5. Require independent security disposition on the integrated exact SHA and operational evidence before restricted release. No current merged candidate or release approval claimed.

## Acceptance gates
P1-04 is complete. B01 P2-01–04, P2-07–10, P2-14–19, P2-22 remain open at their existing exit criteria. P2-11–13 and P2-20–21 require independent reviewer custody, effective permissions, protected runner and staging isolation. P2-24 final clearance depends on P2-23 integration evidence and operational tests. P2-25 remains HOLD. P2-23 retains partial evidence only; no permanent task closed.

## Current pin reconciliation — SDP-002 v1.1
Use the updated #21 and #142 pins above, and retain #146 90973dbc0a4355aaebb67112350974a8ad0b4914 with CI 45496287714 and prior no-findings code review. All six latest Codex findings have committed corrections on #21/#142 and successful exact-head CI, not independent clearance. Historical compare counts, other cohort pins, and static candidate artifacts are retained as historical evidence, not newly verified current inventories. Before isolated construction verify current main, all selected heads and complete diffs; reconcile shared CI and emailer paths and verify all required jobs, not just the two existing supervisor names. #126 documentation head must be captured separately to avoid self-reference. No combined executable candidate constructed in this batch.

## Consolidated authorization boundary
1. P2-24: owner may authorize independent review-only of #21/#142 corrected heads and distinct security disposition for #21/#142/#146 via existing included reviewer capacity, CAD $0. Preserve #146 prior code-review evidence; do not repeat its unchanged code review unnecessarily. No engineering dispatch, edits, signing, or protected operations by reviewer.
2. P2-07: owner supplies read-only current CodeQL inventory and effective security settings; no dismissals or settings changes.
3. P2-23: separately authorize isolated draft integration candidate construction from verified current main, exact selected source pins, full combined CI/CodeQL and disposable CI database checks under confirmed included capacity. No main merge, deployment, real database migration, live provider execution or credential changes. Return combined SHA and evidence; independent final disposition required.
4. P2-12/13/20/21: protected trust, effective credentials/roles and staging acceptance require separate specific authorization and existing environment/cost verification. P2-25 remains HOLD. None of these permissions inferred from this document.
