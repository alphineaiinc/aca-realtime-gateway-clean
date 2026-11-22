# Phase 2 isolated staging inventory — read-only findings

**Date:** 2026-11-21. **Scope:** Read-only connected resource discovery. No Render service configuration, Neon project/branch/roles, secrets or deployment changed.

## Neon project observed
- Project ID: `still-cell-80928176`; name: `alphine-aca-phase2-staging`.
- PostgreSQL 17; AWS `us-east-1`.
- Branch: `staging`, ID `br-lucky-surf-bcn2xj6u`; current state `ready`, default branch, `protected=false`.
- Project-level `allowed_ips.ips=[]`, `block_public_connections=false`; this inventory does **not** establish restricted database network ingress.
- **Unverified:** staging role grants, authenticated login identity, RLS behavior, application connection strings, migration application, audit retention and rotation. Do not infer those from project existence.

## Render discovery
- Connected Render workspace list returned `My Workspace` (`tea-d3rfdemr433s73e3nnfg`).
- User confirmed Render workspace **My Workspace** (`tea-d3rfdemr433s73e3nnfg`); service inventory completed read-only.
- `alphine-aca-phase2a-correction-staging` (`srv-dc0rjq2vcj2c73bi7v5g`): public web service, Virginia, development branch `aca-auto-005-offline-correction-simulation`, auto-deploy OFF, public ingress `0.0.0.0/0`, start `node src/automation/reviewerStagingServer.js`.
- `alphine-aca-phase2-reviewer-staging` (`srv-dc0ibfuc6qcc73ef4m70`): public web service, Virginia, branch `aca-auto-004-phase2-pr-supervision-policy`, auto-deploy OFF, public ingress `0.0.0.0/0`, start `node src/automation/reviewerStagingServer.js`.
- `aca-realtime-gateway-clean` (`srv-d3rfh8umcj7s73cj28c0`): production gateway, public web service, Ohio, `main` branch, auto-deploy ON. **Do not modify.**
- No dedicated Render **private service** appears in the workspace inventory. Staging public services cannot be assumed to provide authenticated edge-to-private mTLS.
- **Unverified:** staging deployment revisions, owner OAuth wiring, independently operated reviewer credentials, private DNS/TLS certificates, secrets and runtime feature flags. Service existence is not proof of activation or security acceptance.

## Current disposition
**NO-GO for live staging activation.** The observed Neon project and branch are useful prerequisites but do not satisfy least-privilege, authenticated transport, independent reviewer, or real OAuth/mTLS requirements.

## Next authorized read-only checks
1. Render workspace selection and service inventory: **completed read-only**. No private owner service found; obtain separate approval before any future creation or deployment.
2. Inspect isolated Neon staging database role grants and repository RLS with read-only queries if explicitly scoped, and redact any connection secrets.
3. Compare observed resources against `docs/phase2-isolated-staging-preparation.md`; prepare an approval-scoped plan, without provisioning or deploying.
