# Phase 2 Codex handoff: dependency remediation (proposal only)

## Evidence and constraints
- Owner's Windows checkout is on `aca-phase2-dependency-remediation-proposal`; local `npm audit fix --ignore-scripts` updated `package-lock.json` but **has not been committed**. The remote branch does not contain these local fixes.
- Owner reports `npm ls --depth=0` passed, 379 non-integration Node tests passed, and production-only npm audit now reports **8 vulnerabilities (1 high, 7 moderate)**.
- Remaining high: `nodemailer` currently 7.0.13; npm proposes 10.6.1 (major). Moderate findings include `archiver` 7.0.1 / `glob` / `minimatch` chains; npm proposes archiver 8.0.0 (major). Other transitive paths may remain.
- Source of these results: owner-provided local console output, **not** GitHub CI evidence. Reproduce in isolated CI before any acceptance.
- No `npm audit fix --force`, merge, deploy, signing, agent dispatch, or Render/Neon/Twilio changes without explicit owner approval.

## Codex implementation packet (not dispatched)
1. Start from a fresh isolated implementation branch based on this proposal branch. Do not change `main`.
2. Reproduce non-forced dependency remediation in a clean disposable checkout, with Node 22 and npm, using `npm audit fix --ignore-scripts` (never `--force`). Commit only reviewed manifest/lockfile changes, not `node_modules` or audit report. Inspect `package-lock.json` for unexpected registry or git URLs.
3. Record before/after `npm audit --omit=dev --json` results, exit codes, direct/transitive package versions, and `npm ls --depth=0`. Keep logs free of tokens and private registry credentials.
4. Locate all `nodemailer` imports and email sending paths, including multi-tenant recipient validation, TLS, attachments, envelope and transport configuration. Write focused compatibility/security tests, then propose a **separate** scoped major upgrade to 10.x with explicit behavior differences.
5. Locate all `archiver` imports and archive generation paths; write archive integrity, traversal, streaming/error handling tests, then propose a **separate** scoped major upgrade to 8.x.
6. Inspect remaining `glob`/`minimatch` and `google-gax` transitive paths; avoid unsafe overrides without upstream compatibility evidence.
7. Run targeted security regressions, full non-integration Node tests, and disposable PostgreSQL integration tests. Capture reproducible commands and exact counts.
8. Require current-head GitHub CI, independent security review and CodeQL review of the actual implementation diff. Existing older review evidence is insufficient.
9. Create a draft PR only after reviewing workflow triggers for side effects; no auto-merge or deployment. Report residual vulnerabilities and blockers without asserting zero risk.
10. Return to owner for explicit merge/deployment decision. Keep agent dispatch disabled.

## Local checkout caveat
Owner has uncommitted changes under `node_modules` and `package-lock.json` plus `phase2-audit-dry-run.json`. Do not overwrite, clean, reset or rebase that working tree. Perform implementation in an independent checkout or branch. A clean GitHub runner will **not** inherit the owner's local lockfile fix.
