# Protected sandbox acceptance — draft, not authorization

## Baseline

PR #142 head 7f51f963726861518b46ab7f3f109aa1a7391d9a passed CI #930 (45419376377): 196 Node tests passed, one skipped, separate PostgreSQL integration passed; CodeQL succeeded. The candidate-controlled sandbox job was removed intentionally. No independent sandbox attestation exists. PR #21 reviewer head observed 8e96ad2a67c559f84ab166538ab6bb05f1137878; independent gate #22 remains open.

## Acceptance boundary

A candidate branch cannot certify its own execution environment. The trusted workflow, harness, result validator and image digest must be selected from a separately reviewed immutable revision outside candidate control. The current probe and planned-patch fixture are useful development inputs, not trusted attestations.

| Gate | Evidence required | State |
|---|---|---|
| Trusted harness | Reviewed immutable commit and harness digest, protected ref controls | Open |
| Runner image | Exact digest, provenance and approval, no floating tags | Open |
| Input | Repository, base SHA, patch SHA-256, exact test inventory, size limits | Open |
| Isolation | Fresh disposable non-root sandbox, no network, no host sockets or secrets, read-only root, bounded writable scratch, dropped capabilities, seccomp, no-new-privileges, CPU/memory/PID/time limits | Open |
| Output | Bounded structured check outcomes, exact input binding, runner and harness identity, exit status; do not trust candidate-generated reports | Open |
| Failure | Timeout, crash, malformed report, missing tests, wrong digest or unknown result deny progression; no automatic replay | Open |
| Independent review | Review of actual trust boundary and tested artifact at exact revision | Open |

## Safe implementation sequence

1. Review and approve the harness and trusted workflow in a separate draft change; do not use pull_request_target to execute candidate code with privileged credentials.
2. Establish protected-ref controls and immutable image provenance through separate owner authorization.
3. Run a fixed benign fixture with no provider, queue, deployment or publication credentials. Prove negative cases (network, filesystem, privilege, resource exhaustion, fake reports) in disposable environment.
4. Verify that candidate source is supplied only as bounded data into the sandbox; never run candidate scripts on the trusted host. No host repository write, Docker socket, credential mount or shared mutable cache.
5. Bind the trusted result to exact candidate patch, tested inventory, harness and image digests. Keep isolatedTestAdapter provenance unverified-runner-report until a separately accepted verifier establishes authenticity.
6. Require independent review and record evidence in #118 before any activation decision.

## Restricted Manager credential acceptance

Use a dedicated single-repository read-only GitHub credential, with only metadata/issues/actions read access as needed; no write, administration, deployment, provider or secret access. Prefer an isolated host with no application credentials. Verify actual permission metadata without exposing token bytes. Database observation is optional and off in the one-shot entrypoint; if enabled, use a dedicated login with only scoped SELECT grants and RLS, never the CI administrator or an application owner. CI #930 proves disposable NOLOGIN role permissions, not actual credential provisioning. Verify disable/revocation and credential-free audit records before operational acceptance.

## Owner decision boundary

No protected-ref changes, credential provisioning, live listener, merge, deployment, model calls or additional spending are authorized by this draft. No live execution or independent acceptance is claimed. Obtain specific authorization only when the protected harness candidate and required operational evidence are ready.
