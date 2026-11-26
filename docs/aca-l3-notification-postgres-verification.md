# ACA-L3 notification outbox: database verification plan

**Status:** draft, no migrations applied. These checks require a disposable PostgreSQL 17 database with migrations 009 and 010 applied in isolation, plus a seeded test tenant. Never point this at production.

## SQL concurrency acceptance

1. Start two independent database transactions. Both execute the `claimNext` CTE against one pending row concurrently. Verify only one returns that row, while the other returns no row. Repeat with multiple rows and verify unique claims.
2. Hold a claim past its lease. Verify `markDelivered` with an expired lease returns false, then run `reapExpiredLeases` and verify the row becomes `failed` with a future `next_attempt_at`.
3. After the retry window, claim again. Verify the original attempt and lease cannot mark delivered or failed.
4. Seed a processing row at attempt 5 with expired lease. Verify recovery sets `dead_letter` and that subsequent claims exclude it.
5. Insert the same `(tenant_id, call_sid)` twice. Verify one intake row and one `(intake_request_id, event_type)` outbox row.
6. Force the outbox insert to fail inside the intake transaction. Verify both rows are rolled back.
7. Confirm queries never cross tenant boundaries and the dry-run preview exposes only IDs and event type.

## Before external delivery can be enabled

- Tenant-controlled and verified notification recipient configuration, including opt-in and removal.
- Provider-specific idempotency/reconciliation for unknown outcomes after network timeout.
- Retryable versus permanent error classification; prevent sending to unverified destinations.
- Rate limits, secret management, log redaction, audit trail, operator pause and dead-letter review.
- Isolated E2E with a mock provider, then separately approved staging tests.
- Explicit owner approval for any migration, deployment, dispatch, or paid service.

**Current behavior:** no worker scheduler, no outbound adapter, no SMS/email sending. `notificationDeliveryDryRun.js` is read-only and its dispatch method throws.
