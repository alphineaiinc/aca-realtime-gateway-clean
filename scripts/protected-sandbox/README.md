# Draft fixed-fixture acceptance

Only run on a separately authorized disposable host with an independently approved, locally available Node image digest. Do not run candidate code or mount host files. The Docker daemon and host are trusted prerequisites, not isolated by this probe. No provider or repository credentials may be present.

Acceptance requires recording exact harness commit, image provenance, Docker version and default seccomp profile, then verifying non-root identity, denied root writes, writable bounded scratch, no network, no host sockets, capability restrictions, resource limits and timeout cleanup. Inspect for residual containers after failure. The harness attempts bounded cleanup by unique name; cleanup is not proof of absence, and failure requires reconciliation. No automatic retries.

The current fixture checks only non-root identity, root write denial, Docker socket absence and scratch write. Other controls are command configuration only until independently tested. No candidate patch execution, trusted attestation or activation authorization is provided.
