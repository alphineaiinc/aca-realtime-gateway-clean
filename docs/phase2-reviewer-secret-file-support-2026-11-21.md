# Phase 2 reviewer GitHub App secret-file loader — 2026-11-21

Implemented `src/automation/reviewerGithubAppSecretFile.js` and offline adversarial tests. The loader reads only `/etc/secrets/github-reviewer-app.pem` when `ACA_REVIEW_GITHUB_APP_PRIVATE_KEY_PATH` matches exactly, and fails closed for missing, invalid, oversized, or unreadable files without exposing their contents.

**Not integrated or deployed:** An initial integration attempt with `reviewerStagingServer.js` caused existing reviewer HTTP tests to fail because they inject the legacy key environment variable. That server change was reverted pending a controlled migration of its test fixtures and runtime wiring. Consequently, the running staging reviewer still uses `ACA_REVIEW_GITHUB_APP_PRIVATE_KEY`, **not** the new file loader. The file path variable alone will not authenticate it.

The target Render reviewer staging service uses branch `aca-auto-004-phase2-pr-supervision-policy`, auto-deploy OFF. No code was deployed and no secret file was read or transmitted in this batch. Do not enable signing or dispatch. Next: update reviewer HTTP tests to inject the file reader, wire it in without legacy fallback, verify CI, then request separate approval for a controlled staging rollout.
