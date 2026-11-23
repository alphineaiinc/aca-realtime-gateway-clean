# ACA-L3 to L4 handoff: notification acceptance

The draft notification subsystem is intentionally not a live messaging service.

## Verified baseline
CI 45284360725 at 195ea40c passed unit and disposable PostgreSQL 17 tests for confirmed intake, atomic outbox, lease fencing, retry recovery, tenant ownership, recipient consent constraints and concurrent simulated delivery deduplication.

## Remaining launch gates
- Authenticated tenant administration and recipient ownership proof. No recipient activation API is exposed by this draft.
- Provider delivery adapter, per-recipient delivery state and reconciliation of ambiguous provider outcomes. A simulation record is not proof of actual delivery.
- Integrated verified call routing and dynamic voice confirmation acceptance.
- Approved staging migration, operational monitoring and pilot calls.

## Operational rule
Keep notification delivery disabled until the above gates pass. Never mark an appointment booked or a message sent merely because intake was recorded. No production migration, provider credential activation, dispatch or deployment without explicit owner authorization.

L4 onboarding and operational tooling may proceed in parallel as draft work; these gates remain tracked in issue 132.
