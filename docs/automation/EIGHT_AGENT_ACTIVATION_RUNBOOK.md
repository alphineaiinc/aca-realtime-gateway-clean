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

## Integrated fixture checkpoint
- Verified baseline ad1f8f8c72aff93a964e54fcbd274efa78a7b5c5, CI 45313271196: persistent eight-role fixture runtime, developer change preparation, publication transport mock tests, disposable PostgreSQL and trusted sandbox fixture. No live model invocation or arbitrary generated-code execution.
- Governance follow-up 0b1598b61a17cfe6998b9ef0b3b7ee8266a777ba: mandatory pre-bound workflow tasks, unique steps, exact claims, transactional handoffs and quarantine denial. Observed CI at documentation time: [{"id":45313627819,"status":"completed","conclusion":"success"}].
- Remaining blockers: actual Phase 2 policy integration and durable dispatch admission; trusted runner for generated code (pinned image and isolation acceptance); independently authenticated review and separate single-use branch/PR admissions with restart reconciliation; actual cost-envelope verification; live artifact classification and retention; durable workflow input and recovery; isolated service/DB role configuration and identity issuance/revocation. GitHub does not provide atomic compare-and-set on PR creation; stale base detection is not an atomic guarantee.
- Do not treat fixture adapters, injected callbacks, approval records or green CI as live authorization. First live test must be bounded read-only, separately approved, with verified budget and no publication. Item 14 remains paused/open; no release clearance.

## Independent review reservation checkpoint
- CI 45314886838 passed at 2cfd43dab7b16b4d7d3ab94117b0699d249d923c.
- Runtime initialization now requires pinned independent reviewer configuration before exposing provider reservation (6691de9); regression tests added (0453609).
- Disposable PostgreSQL review-bound approval, signature, expiry, revocation, substitution, concurrent reservation and budget rollback tests committed at bfbaf13; exact-head CI acceptance pending.
- Standalone offline reservation remains a fixture capability; actual live admission and side-effect enforcement remain outstanding. No live execution authorized. Item 14 remains open.

## Provider failure containment checkpoint
- Transport halts in-process after ambiguous reservation/provider outcomes, missing usage, incomplete output or output ceiling breach; actual attempt counts are preserved. Mock regression coverage at 55b87745d878b0cc58e0764ae6f5a65f4a6ac1dd; CI acceptance pending. No provider calls made.
- Transactional reservation already binds approval, scope, review evidence and persistent call/spend limits. It remains offline-only; restart-safe halt, actual side-effect admission and billing reconciliation are not accepted. Do not enable live transport.

## Durable governance containment
- Scope stop and quarantine deny offline provider reservations across newly constructed adapters and database connections; regression at 743cb65248f38b9cf14f88774be28a0ad66d3001, acceptance pending.
- Manual durable stop is not automatic crash containment. Before live admission, require a durable unresolved-attempt latch committed before external I/O, deny further admission until independent reconciliation, and never automatically refund or retry unknown outcomes. Existing offline reservations do not grant execution.

## Verified containment and cost assessment
- Exact head 02ad38fa291b60535621a231bda8b5c18fca71cf, CI 45317425975: 125 Node tests plus separate PostgreSQL integration passed; trusted sandbox passed. Persistent unresolved/breach admission guard and owner-only fixture reconciliation verified.
- Pinned-rate usage assessment now computes rounded integer micro-USD and detects token ceiling breaches independently of monetary ceiling. This is offline arithmetic, not authenticated provider billing or live admission. New exact-head CI required.

## Cost-bound reconciliation checkpoint
- CI 45317871030 passed at 88d04972363597375bf0d845509972211b2b66b4. Outcome assessment integrated in inert runtime.
- Follow-up binds assessment to exact budget and tests cross-budget denial and token-only breach with derived cost in disposable PostgreSQL. Independent provider billing and live admission remain open.
