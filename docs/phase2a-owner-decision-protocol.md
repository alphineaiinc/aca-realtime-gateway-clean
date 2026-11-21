# Phase 2A — owner decision protocol (development, not an execution system)

This stage creates a human-readable, **advisory** approval packet. It is
not a deployment, agent execution, production authorization, signed reviewer
attestation, or GitHub approval status.

## Contract

1. Upstream `createCorrectionHandoff` must have returned
   `request_owner_approval` from authenticated GitHub CI/PR/issue evidence
   and the read-only, current-head staging correction ledger.
2. `makeOwnerDecisionPacket` binds repository ID, issue number, PR number,
   exact PR head SHA, failed ACA CI run ID, attempt number, and pinned owner
   GitHub user ID. It is valid for at most 30 minutes.
3. `ownerReviewMarkdown` produces a copyable, human-readable review summary.
   It does **not** post comments, create issues, trigger workflows, or
   independently prove evidence. The request ID is a deterministic hash for
   comparison and is **not** a signature or bearer credential.
4. After the owner is authenticated through a separate trusted mechanism and
   the same handoff is re-evaluated from current evidence,
   `recordOwnerDecision` may record **owner intent** to review a targeted
   correction or a rejection. This function does **not** authenticate GitHub
   by itself and must never be wired directly to unverified PR comment text.
5. Even the `owner_intent_to_review` result always returns:
   `agentDispatchAuthorized:false`, `dispatched:false`,
   `mergeAuthorized:false`, `deployAuthorized:false`,
   `signingAuthorized:false`, and `productionAuthorization:false`.

## Known limitations before live owner interaction

- No live approval API, GitHub comment/issue writer, persisted approval
  decision store, replay protection, or authenticated owner identity provider
  has been enabled.
- An owner decision must be stored in an authenticated, transactional,
  one-time-use state machine with exact SHA/CI binding and audit history
  before it can influence later workflows.
- Before any Codex task, the owner must separately approve the exact task
  **and** the actual triggering operation. A decision packet cannot be
  repurposed as that approval.
- Proof-only staging results `staging_proof_only_ready` must not be accepted
  as `request_owner_approval`.
- Reviewer signing remains deferred; there are no signing keys configured.
- The real active-issue queue cannot be bypassed just for tests.

## Safe test procedure

Run `node --test test/phase2a-owner-decision.test.js` and the full ACA CI.
Only fixture-based positive-path test data is used. Temporary CI validation
PRs should be closed unmerged. No Render environment change, Neon write, or
production deploy is required to validate this implementation.
