# Codex implementation task: Phase 2 dependency security

Status: READY FOR MANUAL CODEX PICKUP — NOT DISPATCHED.

## Branch and safety
- Implement only on `aca-phase2-dependency-codex-implementation`, based on `aca-phase2-dependency-remediation-proposal`.
- No merges, deployments, signing, external agent dispatch, or production/staging service/database changes.
- Do not modify or delete the owner's local Windows working tree. Do not commit node_modules or generated audit logs.
- Review GitHub Actions trigger behavior before opening a PR. Current `.github/workflows/ci.yml` runs on PRs to main; `phase2-isolated-verification.yml` is manual-only.

## Verified remote baseline
- Remote `package.json` directly declares `archiver:^7.0.1`, `nodemailer:^7.0.12`.
- Remote `package-lock.json` resolves `archiver@7.0.1`, `nodemailer@7.0.12`, `axios@1.13.2`, `ws@8.19.0`.
- Owner's local **uncommitted** npm audit fix reports 379/379 unit tests passing and 8 residual advisories (1 high, 7 moderate); this is not remote or CI evidence.

## Implement in ten meaningful steps
1. Establish Node 22 clean checkout and record `npm ci --ignore-scripts` baseline and `npm audit --omit=dev --json` summary.
2. Run `npm audit fix --ignore-scripts` WITHOUT `--force` in disposable checkout. Review resulting package-lock diff and dependency integrity.
3. Commit only vetted lockfile changes on this implementation branch; keep a clear separate commit for nonbreaking remediation.
4. Identify nodemailer call sites and transport/envelope/recipient behavior; add tests for existing security invariants.
5. Upgrade nodemailer to a safe supported major version **in a separate commit**, adjust code/tests for compatibility, and record migration risks.
6. Identify archiver call sites and output/stream/error behavior; add tests for archive correctness, path handling and failure modes.
7. Upgrade archiver to a safe supported major version **in a separate commit**, test resulting glob/minimatch chain.
8. Inspect remaining transitive advisories, including google-gax/rimraf. Do not use unsafe overrides or blanket force upgrades.
9. Execute `npm ci --ignore-scripts`, `npm ls --depth=0`, targeted security tests, all non-integration tests, isolated PostgreSQL integration, and `npm audit --omit=dev --audit-level=high`; capture real exit codes and counts.
10. Return a concise report with commit SHAs, residual advisories, incompatibilities, CI status, and independent review requirements. Do not claim tests passed unless executed.

## Required gates before acceptance
- Reproducible clean install on Node 22; no unreviewed registry changes.
- Security/regression tests and disposable PostgreSQL integration pass.
- Actual current-head GitHub CI and independent security review, including CodeQL for changed code.
- Explicit owner approval before any merge or deployment.

## Failure handling
If Codex cannot execute, report **not dispatched**. If any test fails, preserve the branch and provide diagnosis; never conceal failures or broaden privileges.
