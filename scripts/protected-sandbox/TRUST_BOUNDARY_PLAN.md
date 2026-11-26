# Proposed independent trust boundary — not approved

## Signer (SEC-07/08)
Use a separately administered reviewer deployment, immutable reviewed artifact digest, independent key custodian and verifier public-key pin. Candidate authors and engineering agents must not control deployment, key, reviewer identity or verifier configuration. GitHub approval alone is insufficient. Require authenticated substantive disposition with exact repository, PR, SHA, issue, evidence digest, reviewer identity, explicit findings and clearance; deny unknown, stale or conflicting evidence. Verify effective read-only App permissions and staging signed-verdict acceptance before enabling. No keys or signing authorized by this document.

## Sandbox (SEC-10/11/12)
Use a separately administered protected workflow revision, no candidate checkout or secrets, dedicated ephemeral runner, independently verified image index and linux/amd64 manifest digest. Record workflow identity, run/attempt, runner platform, exact executable and test hashes, image provenance, isolation results and cleanup evidence. Separate final cleanup from harness process; failed or inconclusive queries, residuals, ambiguous create and job cancellation deny acceptance. A final empty query is only a snapshot, not proof that an outstanding create cannot complete later. Require trusted runner lifecycle evidence or quarantine for unresolved operations. Never share daemon with other workloads. Resource enforcement tests require separate reviewed fixed fixtures.

## Owner decisions
Select independent administrative custodian and protected installation location; verify existing subscription capacity and CAD 0 incremental cost before any provisioning. No deployment, credentials, workflow installation, signing, runtime dispatch, merge or activation authorized. Independent exact-revision review and protected operational acceptance remain mandatory.
