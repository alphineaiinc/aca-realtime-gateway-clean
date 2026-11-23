"use strict";
// Revocation is safe without a provider. Activation is deliberately unavailable
// until an authenticated recipient ownership and consent workflow is implemented.
async function revokeRecipient(pool, tenantId, recipientId) {
  if (!Number.isSafeInteger(tenantId) || tenantId < 1 ||
      !/^[1-9]\d{0,18}$/.test(String(recipientId))) throw new Error("invalid_recipient_identity");
  const result = await pool.query(
    `UPDATE aca_notification_recipients
     SET enabled=FALSE, revoked_at=COALESCE(revoked_at,NOW())
     WHERE tenant_id=$1 AND id=$2 RETURNING id`,
    [tenantId,String(recipientId)]
  );
  return result.rowCount === 1;
}
async function activateRecipient() {
  throw new Error("recipient_verification_workflow_required");
}
module.exports={revokeRecipient,activateRecipient};
