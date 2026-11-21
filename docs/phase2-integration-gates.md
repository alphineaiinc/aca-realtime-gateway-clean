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
