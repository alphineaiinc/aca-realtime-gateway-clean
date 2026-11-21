# Phase 2 integration gate and owner handoff

## Implemented in draft PR #21
- Read-only PR observer checks trusted repository, GitHub-resolved issue association, and both Node and PostgreSQL CI check names.
- Optional authenticated PostgreSQL correction-history client with consistent read-only snapshot, sequence validation and fail-closed errors.
- Optional independent review provider with a pinned reviewer ID and current-head verification.
- Security tests for missing providers, offline providers and spoofed reviewer identities.
- Real PostgreSQL ledger integration in isolated GitHub Actions.

## Not established by these tests
- **No live authenticated reviewer provider is configured.** The callback is an interface; its caller must prove the transport and actor identity out of band. Caller-supplied authenticatedActorId is not proof by itself.
- **No live database authentication or scoped service role is provisioned.** The supplied pg client is assumed authenticated; read and append adapters are not wired to an operational service.
- The append adapter currently implicitly initializes absent ledgers. This conflicts with the reader's fail-closed treatment of absent history. A controlled, durable initialization protocol and authorization boundary must be designed and tested before operational use.
- The GitHub event observer runs from trusted default branch and may safely defer until its script is present there; a green workflow does not establish a live review pipeline.
- CI check identity/provenance beyond names and current SHA must be pinned to trusted workflows/apps before accepting real readiness.
- Current observer has no production integration or deployment approval.

## Mandatory remaining security gates
1. Provision a separately authenticated and authorized ledger service, including durable initialization, immutable correction events, replay and tamper protection.
2. Implement authenticated reviewer transport with trusted identity, provenance, independence, and review-to-commit binding.
3. Pin trusted CI check providers and verify all required checks, including pagination and rerun semantics.
4. Run end-to-end adversarial tests against these actual services; verify negative cases and rollback.
5. Obtain explicit owner approval before merging or deploying. Never infer merge or deployment authorization from policy readiness.

The supervisor is **advisory only**: it never authorizes merges, deployment or native Codex dispatch.

## Security hardening update
- Append now rejects missing ledgers. An explicit non-resetting initializer exists, but its caller-supplied authentication flag and SHA are NOT independent authentication or proof of GitHub provenance. Operational service-role enforcement remains outstanding.
- CI check evidence now requires a pinned trusted GitHub App ID; the observer fails closed without it. Trusted workflow/run identity and app pin provisioning still need operational verification.
- No external trusted-review service or production database service has been connected. No Phase 2 production readiness is claimed.

## Isolated security validation additions
- CI-only PostgreSQL test now covers explicit initialization, refusal to reinitialize, transactionally serialized corrections, authenticated-client-interface readback, replay, and exhausted budget.
- The migration now defines an immutable-events trigger; integration tests attempt UPDATE and DELETE and require rejection.
- This is a database-level guard, not a substitute for separately provisioned least-privilege roles, authenticated GitHub provenance, or a real independent reviewer.
- No production database was migrated, and no secrets or service permissions were changed.

## Signed independent review boundary
- The observer now accepts review readiness only from an Ed25519-signed verdict checked against a caller-pinned public key, exact repository ID, PR number, reviewer ID, and current head SHA.
- Unsigned callback metadata and caller-supplied actor IDs cannot establish trusted review. Malformed, tampered, stale, cross-repository, and wrong-key evidence fails closed.
- Key provisioning, secure signing service, reviewer independence enforcement, key rotation/revocation, and replay/freshness policy remain external operational gates. A valid signature proves key possession, not reviewer independence by itself.
- This does not connect a live reviewer, configure secrets, merge, or deploy.

## Additional hardening: workflow provenance and database role policy
- CI evidence verifier now requires a pinned GitHub App ID AND workflow ID with matching run head; missing nested workflow provenance is rejected. The current GitHub check-runs REST response may not expose this nested workflow-run metadata, so the observer remains fail-closed until a separately authenticated Actions run lookup is implemented and verified. This is NOT a live readiness signal.
- Added an isolated SQL policy template for NOLOGIN reader, initializer, and writer roles, with no event UPDATE/DELETE grants. This is NOT applied to any database. Existing owner grants and database-level RLS/scope authorization must be assessed before service use; a role grant alone does not enforce per-repository tenancy.
- Still outstanding: real service authentication, key lifecycle, authenticated CI run lookup/rerun semantics, database scope enforcement, adversarial end-to-end validation and explicit owner approval.

## Latest isolated CI hardening
- PostgreSQL integration jobs now execute sequentially because two concurrent test processes raced to create the same schema; previous failure was a CI fixture collision, not an authorization bypass.
- Added an authenticated Actions REST workflow-run lookup in the observer. It binds check runs by check_suite_id to a pinned workflow ID, run ID and head SHA, and fails closed if evidence is missing or paginated beyond one complete page.
- The workflow's default-branch observer still does not provision trusted app/workflow pins, database service credentials, or a signed reviewer provider. This adapter is not proof of operational readiness; real rerun/permission behavior requires staging validation.

## Effective database-role guard (isolated)
- Added `assertAutomationDbRole` to verify PostgreSQL `current_user` matches the exact expected reader/initializer/writer role, rejecting admin sessions and mismatches. The role guard is tested in unit tests and within isolated PostgreSQL role tests.
- This guard is a reusable service integration boundary; it has NOT been wired to live database clients. `SET ROLE` by a privileged session is not proof of service authentication. Production service accounts, per-repository scope enforcement, secure connections, and authenticated caller identity remain outstanding.

## Batch 2: scoped ledger service adapter
- Added `automationLedgerService.js` as an opt-in boundary requiring a pinned PostgreSQL client, exact effective reader/initializer/writer role, matching repository/issue/PR scope, and a verified SHA; correction appends additionally bind the resulting SHA and actor ID to caller context. Negative unit tests cover mismatches.
- IMPORTANT: `context.authenticated` is an assertion from the caller, NOT cryptographic authentication. No live identity provider, TLS-validated login, repository-specific row policy, or service account has been provisioned. Existing low-level adapters remain accessible and must not be exposed to untrusted callers. Do not treat these unit tests as an end-to-end authorization guarantee.
- Phase 2 remains incomplete pending independently operated reviewer service/key custody, real authenticated DB service and repository isolation, trusted CI staging verification, and end-to-end adversarial tests. No merge/deploy authorization is implied.
