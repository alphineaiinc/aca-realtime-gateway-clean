# Runtime review handoff

Source revision: 04193ffc919a30747a5c9b9a93ae252cf659e520

The proposed workflow is deliberately stored outside .github/workflows. The active workflow remains a denial-only hold. The proposal fetches only three immutable public source files, checks their Git blob identities, runs mock regressions, pulls the fixed image for linux/amd64 and invokes the actual harness. No checkout credentials or secrets are needed.

## Open gates

- Independent review of the exact harness and proposal; trusted installation outside candidate control.
- Actual runtime timeout and failed container-state query coverage: current tests mock Docker; do not treat them as live evidence.
- Unknown create outcome remains unresolved; disposable runner teardown is not proof of cleanup.
- Image provenance/platform manifest review, exact run evidence binding and independent acceptance.
- No protected runtime dispatch until clearance. No signing, credential provisioning, merges or deployments.
