# ACA integration map
Baseline L4 0c0a22170d3b8e9408a20ba116f214223dc964b1, CI 45286182682 passed. L2 matrix copied from 9248d853782a4006448f88c78ddb5f073908e7d6.
## Reconciliation order
1. Routing #128 (includes #2) at b7b37eff7039c7617d57381220755b1f8b0218a4. Reconcile sessionController.js with L3 explicit confirmation; do not overwrite verified identity or persistence.
2. Schema #137 at 656dda0797f22267a92ea310c3e5ba92e18c921b. Includes upload hardening; reconcile #124 rather than duplicate.
3. Security #117 overlaps routing tts.js. Preserve both URL validation and stream ownership. #123 and #127 overlap routing pool.js and each other (public.js, browser session scripts, tests). Reconcile verified onboarding design with canonical tenant provisioning. #127 overlaps L4 CI; retain both disposable database suites.
4. #122 Stripe and #125 billing/rate-limit files are disjoint from inspected L1–L4 changes; integrate with tests and L5 review.
5. Verify actual dashboard mount/static paths, metrics call sites, runtime confirmation and provider delivery gates.
## Acceptance
Exact integrated SHA, all regression suites, disposable PostgreSQL migrations and negative isolation tests. No merge, deployment, production writes or dispatch authorized. File overlap is not proof of a textual conflict; inspect actual diffs before combining.
