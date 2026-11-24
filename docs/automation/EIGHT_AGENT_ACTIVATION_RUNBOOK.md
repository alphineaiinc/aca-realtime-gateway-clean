# Eight-agent controlled activation runbook

Status: NOT READY FOR LIVE EXECUTION. SDP-001 and independent reviewer #22 remain mandatory.
Scope: PR #142, exact reviewed head only. Item 14 remains open.

## Gate 1 — finish offline development
- Verify all required CI jobs at the current exact head, including PostgreSQL integration and trusted sandbox probe.
- Complete isolated patch execution using a pinned image, disposable workspace, trusted tests, no credentials/network, bounded output and verified cleanup. A successful trusted probe is not proof of arbitrary-code isolation.
- Integrate durable workflow/task inputs, proposal artifact retention, cross-role handoff, and restart recovery.
- Implement draft-only publication with exact-base compare-and-set, independent review evidence, single-use owner authorization, idempotency and recovery after ambiguous writes. No direct main writes.
- Integrate with existing Phase 2 queue/reviewer/policy architecture, rather than assuming independent modules are operational.
- Verify stop/quarantine, revocation, cost reservation and cancellation at actual side-effect boundaries.

## Gate 2 — configuration and owner decision
- Establish dedicated isolated runtime and database roles; no production ACA access.
- Select eight model assignments and verify current provider pricing and conservative maximum billable costs. Configure persistent call/spend caps; reconcile actual usage; disable automatic top-up.
- Provision short-lived GitHub read-only credentials and separate narrowly scoped draft writer only when separately approved.
- Establish trusted owner/worker identity issuer, revocation source and least privilege. Never commit keys.
- Pin image digest and exact repository revision. Prepare manifest and evidence digest.
- Request explicit owner approval for narrowly scoped paid connectivity test, separately from draft publication or any deployment. Approval records alone do not grant execution.

## Gate 3 — controlled verification
- Execute one isolated, bounded read-only assignment with one model request first; verify evidence, costs, logs and stop.
- Run all eight roles against a non-sensitive bounded issue; validate individual quality, cross-role handoffs, failure recovery and independent review.
- Test a disposable patch and draft-only publication after separately authorized security acceptance.
- Confirm no main modification, production access, secret leakage or permission escalation.

## Gate 4 — limited activation
- Obtain independent reviewer acceptance on exact implementation/configuration and owner activation decision.
- Enable only approved capabilities, scope, budget and time window. Start with one Item 14 assignment after applicable security gates.
- On any unknown outcome, stop admission, quarantine affected role, preserve metadata and reconcile manually. Do not retry ambiguous external writes.
- No merge, deployment, signing, production database write or secret change is implied.

## Current verified baseline
Trusted sandbox probe and Node CI passed at a776d4853c9d69a926aaff436868c2a605bc31c7 (run 45297144234). Later changes require new exact-head validation. Inert initialization is not live runtime orchestration. No credentials, provider calls or live migration performed.
