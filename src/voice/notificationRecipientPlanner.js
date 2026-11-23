"use strict";

// Internal delivery planning only. No external transport or scheduler.
function validDestination(channel, value) {
  if (typeof value !== "string" || value !== value.trim()) return false;
  if (channel === "sms") return /^\+[1-9]\d{7,14}$/.test(value);
  if (channel === "email") return value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) && !/[\r\n]/.test(value);
  return false;
}
async function planNotification(pool, tenantId, outboxId) {
  if (!Number.isSafeInteger(tenantId) || tenantId < 1 ||
      !/^[1-9]\d{0,18}$/.test(String(outboxId))) throw new Error("invalid_notification_identity");
  const result = await pool.query(
    `SELECT r.id AS recipient_id, r.channel, r.destination
       FROM aca_notification_outbox o
       JOIN aca_notification_recipients r ON r.tenant_id = o.tenant_id
       WHERE o.id = $1 AND o.tenant_id = $2
         AND o.event_type = 'intake.confirmed'
         AND o.status IN ('pending','failed','processing')
         AND r.enabled AND r.verified_at IS NOT NULL
         AND r.consent_at IS NOT NULL AND r.revoked_at IS NULL
       ORDER BY r.id LIMIT 101`,
    [String(outboxId), tenantId]
  );
  if (result.rows.length > 100) throw new Error("recipient_limit_exceeded");
  return result.rows.map(row => {
    if (!validDestination(row.channel, row.destination)) throw new Error("invalid_recipient_destination");
    return Object.freeze({
      recipientId: String(row.recipient_id),
      channel: row.channel,
      // Do not expose destination in the plan or include caller data.
      idempotencyKey: `aca:intake:${tenantId}:${outboxId}:${row.recipient_id}`,
      mode: "dry_run_only"
    });
  });
}
module.exports = { validDestination, planNotification };
