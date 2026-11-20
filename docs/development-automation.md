# Development Automation (Safe Pilot)

This guide documents the currently verified GitHub + Codex workflow for this repository and the approval gates that must stay human-controlled.

## Scope and Evidence

- Repository: `alphineaiinc/aca-realtime-gateway-clean`
- Baseline implementation evidence: PR #3 (`https://github.com/alphineaiinc/aca-realtime-gateway-clean/pull/3`)
- CI workflow file: `.github/workflows/ci.yml`
- Agent policy file: `AGENTS.md`
- PR checklist template: `.github/pull_request_template.md`

## CI Workflow: `.github/workflows/ci.yml`

Workflow name: `ACA CI`

Triggers:
- `pull_request` to `main`
- `push` to `main`

Job:
- Job id: `node-tests`
- Check name in GitHub UI: `Node tests`
- Runner: `ubuntu-latest`
- Timeout: `15` minutes

Execution steps:
1. Checkout repository (`actions/checkout@v4`)
2. Set up Node `22` with npm cache (`actions/setup-node@v4`)
3. Install dependencies with `npm ci --ignore-scripts --no-audit --no-fund`
4. Syntax-check tracked JavaScript files with `node --check` (excluding `node_modules/`)
5. Run tests:
   - If `package.json` has a `scripts.test` entry, run `npm test`
   - Otherwise run `node --test test/*.test.js`

Interpretation of `Node tests` check:
- `success`: dependency install, JS syntax checks, and the configured test command all passed.
- `failure`: at least one of those stages failed.
- `cancelled`: usually superseded by a newer run because concurrency is enabled (`cancel-in-progress: true`).

PR #3 evidence for this check:
- `Node tests` check run completed successfully:
  `https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/44235682798/job/134571124866`

## Approval Gates and Human Control

Required merge/deploy posture in this repository:
- Human approval is required before merge and any deployment authorization.
- Passing CI and Codex review are evidence inputs, not release authorization.

Evidence:
- `AGENTS.md` states:
  - "No production access, deployments, migrations, auto-merge or force pushes without explicit human approval."
  - "A green CI run or agent review is not a release approval."
- `.github/pull_request_template.md` includes:
  - Approval checklist for human review, explicit merge authorization, and separate deployment authorization.

### `ACA - Protect Main` Ruleset

This pilot assumes the repository uses an `ACA - Protect Main` ruleset in GitHub settings to protect `main` (PR-based flow and required checks/review gates).

Verification note:
- Rulesets are configured in GitHub repository settings, not in tracked source files.
- Confirm the live settings in GitHub UI (`Settings` -> `Rulesets`) before relying on enforcement for any merge.

## AGENTS.md and PR Template Usage

When opening/updating a PR:
1. Follow `AGENTS.md` constraints (small scoped changes, no unsafe operations, no claims of production validation from isolated tests).
2. Complete `.github/pull_request_template.md` with:
   - Story/issue reference
   - Summary
   - Evidence checklist
   - Risk/rollout notes
   - Approval checklist
3. Keep PR open until a human explicitly authorizes merge.

## Codex Review Visibility (PR #3 Evidence)

PR #3 includes visible Codex review artifacts in the conversation timeline:
- Manual trigger comment: `@codex review`
- Codex review summary comment (completed status)
- Codex review receipt comment ("Didn't find any major issues")

These comments confirm review visibility in GitHub for this repository setup.

## Simple iPhone GitHub Mobile Review Procedure

1. Open GitHub Mobile on iPhone and navigate to repository `alphineaiinc/aca-realtime-gateway-clean`.
2. Open `Pull requests` and select the target PR.
3. Check `Checks` and confirm `Node tests` status.
4. Review `Conversation` for:
   - PR template completion
   - Codex review comments (if requested/run)
   - Any unresolved feedback
5. Review file changes and confirm scope matches the issue.
6. Add a human review comment or approval decision.
7. Do not merge until explicit human merge authorization is recorded.
8. Do not deploy from mobile approval alone; deployment authorization remains separate.

## Current Verified Limitations

Not yet verified in this pilot:
- Automatic issue-to-Codex dispatch without manual assignment/trigger.
- Fully automated correction loops after CI/review failures.

Operational implication:
- Continue using explicit human-controlled assignment, review requests, and merge/deploy approvals until these capabilities are separately validated.
