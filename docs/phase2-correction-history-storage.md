# Phase 2 correction-history storage contract

Status: **not connected**. The supervisor MUST continue to return blocked or
pending when authoritative correction history is unavailable.

## Required storage and trust boundaries

Use a private, server-side store owned by the orchestration service, not PR
branches, PR bodies, issue comments, workflow artifacts, or labels. Records are
keyed by immutable GitHub repository database ID + issue number + PR number.
The service must authenticate its own GitHub App installation and require
explicit, separate permission for every correction write.

A correction record includes schema version, immutable identity tuple, sequence,
prior and resulting commit SHA, failure fingerprint, trusted actor identity,
provider event ID, and server-assigned timestamp. A new correction may be
appended only with an atomic compare-and-swap on the previous ledger version;
never overwrite or reset history when a PR is rebased, force-pushed, or reopened.
Enforce uniqueness of event ID and sequence and cap attempts at two. Maintain
an audit log separate from the mutable projection.

## Read protocol

1. Authenticate the orchestration service and authorize the repository scope.
2. Fetch the ledger with a consistent read, including the version and complete
   append-only event history. Missing records are **unknown**, not zero attempts,
   unless an authenticated initialization event is present.
3. Verify event signatures or trusted storage metadata, repository/issue/PR
   identity, monotonically increasing sequence, and record integrity.
4. Supply validated history to the policy only after these checks succeed.
   A caller-provided boolean is not sufficient proof of authentication.
5. On storage error, version conflict, ambiguity, or corrupt data, fail closed
   and request human intervention. Never auto-dispatch correction work.

## Acceptance tests before wiring

- Concurrent appends cannot exceed the two-attempt budget.
- Replayed events and conflicting sequence/version are rejected.
- Force-push, PR reopen, and workflow rerun cannot reset attempts.
- Cross-repository, cross-issue, and cross-PR histories are rejected.
- A forged GitHub comment, PR body, or user-generated artifact cannot supply
  trusted history.
- Storage outage and empty uninitialized ledger block decisions.
- No observer or ledger API is allowed to merge, deploy, or start native Codex.

No storage service or credentials are provisioned by this change. Integration
requires an owner-approved storage choice and credentials scoped to the service.

## Current-head failure recurrence and CI provenance

The observer reads previous failure fingerprints from the authenticated ledger. After a prior correction, independently authenticated current failure evidence must establish recurrence before another correction is recommended. Equal fingerprints escalate; absent, invalid or unavailable fingerprints are unknown and deny further correction. A different verified fingerprint permits only the existing bounded policy. Successful CI and review need not manufacture a failure fingerprint. Both CI bridges use authenticated attempt-specific job inventories and re-read the workflow run; missing, stale or incomplete evidence fails closed. The trusted host must establish the fingerprint provider's identity and scope; this source change neither provisions nor activates it.
