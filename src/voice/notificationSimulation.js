"use strict";
// Database-only simulation. Never marks actual delivery or calls a provider.
const { planNotification } = require("./notificationRecipientPlanner");
async function simulateNotification(pool, tenantId, outboxId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const plans = await planNotification(client, tenantId, outboxId);
    let created = 0;
    for (const plan of plans) {
      const result = await client.query(
        `INSERT INTO aca_notification_simulations (tenant_id,outbox_id,recipient_id)
         SELECT o.tenant_id,o.id,r.id
         FROM aca_notification_outbox o
         JOIN aca_notification_recipients r ON r.tenant_id=o.tenant_id
         WHERE o.tenant_id=$1 AND o.id=$2 AND r.id=$3
           AND o.status IN ('pending','failed','processing')
           AND r.enabled AND r.verified_at IS NOT NULL AND r.consent_at IS NOT NULL
           AND r.revoked_at IS NULL
         ON CONFLICT DO NOTHING RETURNING recipient_id`,
        [tenantId,String(outboxId),plan.recipientId]
      );
      created += result.rowCount;
    }
    await client.query("COMMIT");
    return {mode:"simulation_only",planned:plans.length,created};
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
module.exports={simulateNotification};
