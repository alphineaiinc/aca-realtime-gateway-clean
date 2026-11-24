# Fixed-fixture acceptance evidence (non-authorizing)
 
Reviewed workflow revision: 07c24c8240669fea6578e6f562102e1a9d68a1e6.
GitHub run 45453982049 passed; regression run 45453994171 passed.
Image: node@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb.
 
## Evidence and gaps
- Inline fixed probe: nine runtime checks passed; configured CPU, memory, swap and PID limits verified; wait timeout and explicit removal passed.
- Actual fixtureHarness.js execution is not established by the inline probe. Its UID predicate differs (nonzero versus exactly 65534); success does not explicitly verify container absence; failure cleanup is best effort.
- No candidate checkout or execution is authorized. Do not execute branch-sourced harness under the existing fixed-fixture-only authorization. A separately reviewed immutable harness source and explicit scope confirmation are required before such execution.
- Resource exhaustion enforcement, independent image provenance, trusted runner/workflow ownership, exact input/output binding and independent review remain open.
- A branch-controlled success log is not an attestation. No signing, credential provisioning, dispatch, merge or deployment is authorized.
 
## Next acceptance criteria
1. Independently review immutable harness and image provenance.
2. Establish a trusted execution boundary outside candidate control; verify exact harness bytes before execution.
3. Verify fail-closed outcomes, bounded cleanup and residual absence; exercise bounded resource enforcement in disposable isolation.
4. Bind evidence to immutable inputs, run identity, test inventory and result; independent reviewer verifies all gates before any activation decision.


### SEC-11–13 source acceptance checkpoint
The active `.github/workflows/protected-fixed-fixture.yml` remains a permissionless, manually dispatched denial-only hold. A new regression test asserts it has no push, pull-request or workflow-run trigger, no write or OIDC permissions, and continues to exit non-zero pending independent acceptance. The proposed runtime workflow remains separate and inactive. Existing harness tests cover ambiguous create, timeout, ambiguous removal, failed state query, residual container, and secondary cleanup attempts; policy tests require exact source/image/runner/run-attempt scope, all fault outcomes, teardown and quarantine disposition, and fail closed without independent authentication. No runner teardown, image-publisher provenance or production runtime acceptance is claimed by these source tests.

### Offline authenticated acceptance integration
The offline policy requires matching scope and fault claims, two separately pinned Ed25519 public keys and authority identities, fresh challenge-bound signed teardown and provenance claims, and active key status for each exact role/authority/fingerprint. It snapshots input envelopes and trust before asynchronous status checks and re-verifies signatures and expiry afterward. Regression coverage includes revoked or unavailable status, expiration during lookup, caller mutation and invalid baseline claims. Even matching authenticated evidence returns accepted=false, executionAuthorized=false and attestation=false. The five baseline fault outcome claims are not themselves signed by this verifier; protected fault evidence, independent custody, actual revocation service, freshness/replay management and runner destruction remain external acceptance blockers. Key status is a point-in-time check, not proof that revocation cannot occur immediately afterward. No operational keys, signing, runtime execution or deployment.
