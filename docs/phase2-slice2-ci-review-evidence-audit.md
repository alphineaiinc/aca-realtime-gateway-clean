# Phase 2 slice 2 — CI provenance and signed reviewer audit

**Scope:** `verifiedCiEvidence.js`, `ciWorkflowRunBinding.js`, `signedReviewEvidence.js`, `trustedReviewerProvider.js`, related tests. **Status: code inspection completed; operational identity verification pending.**

## Verified in source
- Required check names are unique and pinned to a trusted GitHub App ID, workflow ID and current 40-hex-character head SHA.
- Check suite IDs are joined to separately fetched workflow runs, rejecting duplicate suite bindings and absent/wrong run IDs.
- Missing required checks and incomplete check-run pagination fail closed.
- Reviewer verdicts use Ed25519 signature verification bound to repository, PR, head SHA, reviewer ID, verdict and finding count.
- Reviewer provider requires HTTPS, exact allowed host, no URL credentials/query/fragment/explicit port, and an injected authenticated transport.
- Neither evidence adapter grants merge/deploy or native Codex dispatch.

## Risks / operational gates
1. `trustedCiAppId` and `trustedCiWorkflowId` must be provisioned from an independently verified source; caller-provided pins alone do not prove trust.
2. Workflow run lookup is limited to one 100-run page; ambiguity or incomplete pagination blocks readiness. Validate actual GitHub REST behavior for reruns, check suite mapping, and permission scopes in staging.
3. Signed reviewer evidence proves key possession, **not** reviewer independence, freshness beyond exact head SHA, key revocation, or custody. Require independent operator, rotation/revocation and replay/freshness policy.
4. `trustedReviewerProvider` delegates TLS identity, redirects, timeouts and response limits to the injected transport. Test that transport against real staging endpoints before activation.
5. Review results are advisory only. All six execution flags must remain false; no real signing key or live service is authorized.
6. The observer's trusted-default-branch workflow may defer until an explicitly approved integration. A green observer workflow does not imply a live review provider.

## Next safe checks
- Add targeted negative fixtures for malformed CI run IDs, duplicate suite runs and mismatched app/workflow evidence, using only disposable data.
- Verify signing key rotation/revocation behavior in a separate staging-only design, without provisioning real keys now.
- Keep protected PR #27 unmerged; do not activate production/staging services or native Codex without explicit owner approval.
