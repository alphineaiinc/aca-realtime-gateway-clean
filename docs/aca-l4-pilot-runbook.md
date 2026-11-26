# Pilot runbook — draft, no activation authorized

## Integration prerequisites
Stack and reconcile PRs #2, #128, #136, #137, #138 and applicable security PRs #117, #122–125, #127. Validate exact integrated SHA. Current L4 branch inherits #138 only; legacy tenant fallback remains unsafe until routing integration.

## Manual onboarding (approved staging only)
1. Establish isolated database and service; inventory secret names only, never values. Confirm cost ceiling and rollback owner.
2. Create synthetic tenant via canonical master_tenants provisioning; assign verified called number and explicit workflow. Reject unknown numbers and duplicate assignments.
3. Configure voice and tenant-scoped KB; test cross-tenant retrieval denial. Keep recipient activation and external delivery disabled until ownership and consent verified.
4. Restrict dashboards to authorized operators. Existing dashboard data route exposes raw log messages and diagnostics; remediate before pilot. Resilience metrics module is currently a no-op, not proof of monitoring.

## Acceptance matrix
- Valid signed inbound call; unknown number; invalid signature; replayed grant; tenant switch.
- Required slots, correction, explicit confirmation, duplicate confirmation, hangup, DB failure; never promise booked appointment.
- KB tenant isolation; provider timeout; speech interruption; notification retry, revocation and ambiguous delivery reconciliation.
- Unauthorized dashboard access, redacted errors, health degradation, rollback drill.
- Record exact SHA, fixture identifiers, CI run and staging evidence for each gate. No real caller data in test evidence.

## Owner decision
Readiness is not authorization. Separate approval required for staging resources/writes, credentials, merges, deployment, paid activation and real calls. Rollback must disable inbound routing and delivery, restore prior approved service version, preserve confirmed requests, and reconcile queued jobs. Never blindly replay ambiguous sends.
