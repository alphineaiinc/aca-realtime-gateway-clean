# SG-001 inactive acceptance preparation — batch 134

**Not executable infrastructure.** DA-CRIT-001 7183304688; batch 133 7192753065; P2-12,19–21,25,16–17. Source PR #167 37f9a5327e99f78c3e6208cfba9aaf87c1c15aad unchanged. This separate branch is not a release or an operational approval. No workflow installation or PR opening. The `.js.txt` file is source for independent assessment only, with no process-spawning or deployment code.

## Immutable binding and inherited fixture

The manifest replaces the stale source revision and harness blob in the old proposal with the actual current immutable source and blob. It reuses the historical image digest, not an asserted publisher provenance. Existing fixture runs 45453982049/45453994171 and CI 45759195128 (546 passes) and CodeQL 45759190631 are historical or candidate test evidence, not approval of this new draft. The draft describes the existing fixture restrictions without executing candidate code. A future reviewed host adapter must verify fetched bytes with Git blob hashing, exact source tree, the draft commit/blob and independently authenticated publisher/platform manifest, then compare the actual local executable image ID with verified provenance before use. Deny missing/mismatched evidence. No candidate-controlled trust roots. No external registry pulls in this batch.

## Effective permission and cost checklist

Before any setup: record actual runner/job identity and permissions, absence of repository write grants, secrets, OIDC, production DB/management access and host socket inside fixture; independently verify actual nonroot, readonly root, network none, capabilities, resource limits and bounded tmpfs. Host daemon access belongs only to separately authorized trusted fixture operator. No live production probing. Obtain actual included Actions/registry allowance and bounded usage evidence; unknown/nonzero incremental cost denies. No model calls for fixed fixture. Manifest nulls are intentionally unapproved, not defaults or acceptance.

## Exact cleanup boundary

Pre-authorize separately the exact run/attempt/nonce binding, designated actor, UTC start/end and cleanup deadline, exact runner and owned resource identifiers or preallocated unique binding, effective stop/cancel/remove permissions and independent observer. Proposed 15-minute fixture and 15-minute cleanup budget, subject to approval, within 60-minute run authorization. Record resource IDs from trusted create receipt; inspect exact immutable ID plus binding/name before proposing removal; no prefix sweep, name-only removal or ambiguous retry. Ambiguous create without authenticated ID, daemon unavailable, residuals or whole-job cancellation require quarantine and independently observed runner disposal; never claim absence from a failed query. Separate observer confirms actual revocation, exact resource absence and runner disposal. Teardown-only authority survives expiry solely for bounded cleanup. Exceeded deadline escalates, no restart. Pure plan functions cannot execute or authorize operations.

## Remaining gates

Independent substantive clarification of P2 4704090817/4704090821 and SG-001 normative comparison, confirmation of exception validity after changed artifact/material finding, independent review of this exact new draft, protected host adapter and effective permissions, publisher provenance, owner-approved CAD0 evidence, independent observer and separately authorized setup/teardown and per-run manifest. Full Tier 2 independent custody remains unchanged and blocked. No task closure inferred. November 30 remains mandatory.
