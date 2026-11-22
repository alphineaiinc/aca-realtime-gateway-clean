# Dependency vulnerability remediation proposal (Batch 10)

**Status:** Security hold. Do not merge, deploy, modify production, change staging environment, or run `npm audit fix --force` without separate approval.

## Operator evidence (November 22, 2026)
- Local security tests: 31 passed; non-integration suite: 379 passed.
- `npm.cmd audit --omit=dev --audit-level=high` ran and exited 1.
- Audit reported **27 total vulnerabilities: 2 critical, 12 high, 12 moderate, 1 low**. Counts represent affected dependency findings, not proven exploitable ACA endpoints.
- Critical packages: `protobufjs` and `proxy-addr`. High findings include `@grpc/grpc-js`, `axios`, `body-parser`, `compression`, `multer`, `nodemailer`, `ws`.
- `npm audit fix --force` would propose breaking upgrades for at least `archiver` and `nodemailer`. **Do not run automatically.**

## Lockfile versions verified
| Package | Locked version |
| --- | --- |
| @grpc/grpc-js | 1.14.3 |
| protobufjs | 7.5.4 |
| proxy-addr | 2.0.7 |
| axios | 1.13.2 |
| body-parser | 2.2.2 |
| multer | 2.0.2 |
| nodemailer | 7.0.12 |
| ws | 8.19.0, nested 7.5.10 |
| compression | 1.8.1 |
| archiver | 7.0.1 |

## Batch 10 — ten tasks
1. Record successful audit invocation and nonzero exit.
2. Classify severity and separate advisory findings from confirmed exploitation.
3. Prioritize critical protobufjs and proxy-addr.
4. Prioritize high-risk web/network libraries (axios, ws, multer, body-parser).
5. Identify breaking-change exceptions (archiver, nodemailer).
6. Confirm exact lockfile versions and nested ws dependency.
7. Create isolated remediation proposal branch.
8. Preserve current application code and lockfile unchanged until a reproducible update is tested.
9. Define test gates: fresh npm audit, 31 security regressions, 379 unit regressions, 8 disposable PostgreSQL integrations, independent security review.
10. Define release gate: owner-approved reviewed PR, passing checks, staged smoke tests and rollback; never deploy based solely on npm audit.

## Next operator step (read-only)
From a clean working tree on the remediation branch, generate an **audit JSON** and a **dry-run remediation plan** without editing dependency files:
```powershell
git fetch origin
git switch aca-phase2-dependency-remediation-proposal
git pull --ff-only origin aca-phase2-dependency-remediation-proposal
& (Get-Command npm.cmd -CommandType Application).Source audit --omit=dev --json > phase2-audit.json
& (Get-Command npm.cmd -CommandType Application).Source audit fix --dry-run --ignore-scripts --json > phase2-audit-dry-run.json
```
Audit output files contain dependency metadata; inspect before sharing. The `--dry-run` command should not modify the lockfile, but confirm with `git status --short` and `git diff -- package.json package-lock.json` afterward. Do not use `--force`. This is **not** CodeQL or an actual production patch.
