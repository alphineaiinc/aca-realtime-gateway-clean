"use strict";

// Dry-run preparation only. Never contacts a provider, sends a message, or
// starts a worker. A delivery adapter requires separate approval.

function safePreview(record) {
  if (!record || !Number.isSafeInteger(Number(record.id)) ||
      !Number.isSafeInteger(Number(record.tenant_id)) ||
      !Number.isSafeInteger(Number(record.intake_request_id)) ||
      record.event_type !== "intake.confirmed") {
    throw new Error("invalid_outbox_job");
  }
  return Object.freeze({
    outboxId: Number(record.id),
    tenantId: Number(record.tenant_id),
    intakeRequestId: Number(record.intake_request_id),
    eventType: "intake.confirmed",
    deliveryMode: "dry_run_only",
  });
}

// Read-only inspection: does not claim or mutate jobs.
async function previewPending(pool, limit = 25) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("invalid_preview_limit");
  }
  const result = await pool.query(
    `SELECT id, tenant_id, intake_request_id, event_type
     FROM aca_notification_outbox
     WHERE status IN ('pending','failed') AND next_attempt_at <= NOW()
     ORDER BY next_attempt_at, id LIMIT $1`,
    [limit]
  );
  return result.rows.map(safePreview);
}

// This function is intentionally a hard stop. No outbound delivery exists.
async function dispatchNotification() {
  throw new Error("notification_delivery_disabled");
}

module.exports = { safePreview, previewPending, dispatchNotification };
