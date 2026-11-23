"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { previewPending, safePreview, dispatchNotification } = require("../src/voice/notificationDeliveryDryRun");
test("dry run returns identifiers only, no caller PII", async () => {
  const pool = { async query(sql, params) {
    assert.match(sql, /^SELECT /);
    assert.match(sql, /status IN \('pending','failed'\)/);
    assert.deepEqual(params, [25]);
    return { rows: [{ id: 1, tenant_id: 2, intake_request_id: 3, event_type: "intake.confirmed", slots: { phone: "secret" } }] };
  } };
  assert.deepEqual(await previewPending(pool), [{ outboxId: 1, tenantId: 2, intakeRequestId: 3, eventType: "intake.confirmed", deliveryMode: "dry_run_only" }]);
});
test("invalid previews are rejected and delivery always fails closed", async () => {
  assert.throws(() => safePreview({ id: 1, tenant_id: 2, intake_request_id: 3, event_type: "unknown" }), /invalid_outbox_job/);
  await assert.rejects(dispatchNotification(), /notification_delivery_disabled/);
  await assert.rejects(previewPending({ query() { throw Error("should not query"); } }, 0), /invalid_preview_limit/);
});
