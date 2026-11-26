# Authenticated PR security triage evidence — Phase 2

## Implemented (advisory only)

`src/automation/authenticatedPrSecurityTriage.js` accepts an already-authenticated, **read-only** GitHub API client, the expected repository numeric ID, PR number and 40-character head SHA. It verifies:

- The repository ID and owner/name from the GitHub API, independently of PR text.
- The PR's base and head repository IDs (forks are excluded), current head, state and exact file count.
- A complete single page of at most 100 changed files. Larger or incomplete lists fail closed.
- The security patch inspection result and a second GitHub PR head/base check after file retrieval.
- An API failure or ambiguous result yields `blocked`.

The result is **never an independent review**: `independent:false` is always present. Heuristic patch matches are descriptive findings, not authoritative vulnerability detection. Even a clean diff returns `manual_review_required`, not a signed `passed`.

## Important operational limitations

This implementation uses an injected authenticated GitHub client. CI exercises the evidence bridge with simulated GitHub responses, **not with the live Security Reviewer App's credentials**. It is not yet invoked by a continuous reviewer service, nor is it a semantic code review. Live App authentication and protected signing are separate gates.

Do not install private keys on the unreviewed draft-branch Render runtime. Do not merge PR #21, deploy the ACA application, or dispatch native Codex tasks without explicit owner approval.
