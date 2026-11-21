# Phase 2A staging correction request activation (not yet approved)

**Status:** development-only. This document does not authorize merge, deploy,
GitHub App signing, autonomous Codex, or production changes.

## Existing isolation
- Source PR: #27 (stacked on the Phase 2 PR supervision policy branch).
- Target Render staging reviewer: `alphine-aca-phase2-reviewer-staging`.
- Target Neon staging: isolated `still-cell-80928176` project, `staging` branch.
- Verified ledger role: `aca_p2_reader_a` (table SELECT, no INSERT/UPDATE/DELETE).
- No GitHub or database credentials are committed to the repository.

## Runtime configuration (configure only after owner approval)
- `ACA_PHASE2A_ENABLED=true` — explicit opt-in; unset otherwise.
- `ACA_PHASE2A_API_TOKEN` — separate high-entropy HTTP bearer secret.
- `ACA_PHASE2A_GITHUB_READ_TOKEN` — separate restricted, **read-only** GitHub
  credential for exactly `alphineaiinc/aca-realtime-gateway-clean`, with
  metadata, Actions, pull-request and issue read access (and GraphQL issue
  association support). Do not reuse reviewer signing keys.
- `ACA_PHASE2A_DATABASE_URL` — isolated staging Neon PostgreSQL URL for
  `aca_p2_reader_a`; never production.
- `ACA_PHASE2A_LEDGER_ROLE=aca_p2_reader_a`.
- `ACA_PHASE2A_WORKFLOW_ID=422174901`.
- Existing `ACA_REVIEW_REPOSITORY=alphineaiinc/aca-realtime-gateway-clean` and
  `ACA_REVIEW_REPOSITORY_ID=1080201236`.

The runtime constructs a TLS-verifying PostgreSQL pool (max two connections)
and a GitHub REST/GraphQL read client only when fully configured.
Incorrect or absent configuration yields an unavailable/blocked endpoint.

## Approval-gated staging validation
1. Obtain *explicit approval* for a one-time **staging-only** deployment of the
   reviewed PR head, without merging to main. Confirm no app services are deployed.
2. Provide staging-only secrets securely in the Render service configuration,
   never GitHub issues, PR text, chat, CI output or code. Do not generate or
   enable the reviewer signing key for this exercise.
3. First test `GET /health`, then verify that missing/wrong bearer tokens to
   `POST /phase2a/correction-request` return 401.
4. Use a controlled open non-draft allowlisted test issue and linked PR with a
   known failing ACA CI run. The request body must contain only
   `{"runId":<positive GitHub Actions run id>}`. For any missing, inconsistent,
   stale, fork, or ambiguous evidence, expect a blocked state.
5. The correction ledger must have been separately initialized by an approved
   authenticated initializer, for that exact issue/PR. Missing history is
   **unknown**, never zero attempts. The runtime does not initialize it.
6. When *all* evidence is present, expect `request_owner_approval`; do not
   dispatch an agent without a further explicit owner decision.
7. Revoke staging-only credentials / set `ACA_PHASE2A_ENABLED=false` and return
   to the previous staging deploy if rollback is needed.

## Non-goals
- No agent dispatch, PR merge, production deployment, reviewer signing,
  correction ledger mutation, or automatic retries.
- A successful local mock/CI test is **not** a live staging demonstration.
