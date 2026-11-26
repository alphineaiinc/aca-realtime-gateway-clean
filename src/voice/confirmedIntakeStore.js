"use strict";

// Explicitly called only after caller confirmation; never from a speculative
// transcript or call-end cleanup. No notification is dispatched here.
function validTenantId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function validateConfirmedIntake(input) {
  const tenantId = validTenantId(input?.tenantId);
  const callSid = String(input?.callSid || "").trim();
  const clusterId = String(input?.clusterId || "").trim();
  const slots = input?.slots;
  if (!tenantId || !/^CA[a-f0-9]{32}$/i.test(callSid) ||
      !/^[a-z][a-z0-9_]{1,79}$/.test(clusterId) ||
      !slots || typeof slots !== "object" || Array.isArray(slots) ||
      Object.keys(slots).length === 0) {
    throw new Error("invalid_confirmed_intake");
  }
  return { tenantId, callSid, clusterId, slots, intent: input?.intent || null };
}

async function saveConfirmedIntake(pool, input) {
  if (!pool || typeof pool.connect !== "function") throw new Error("database_unavailable");
  if (input?.confirmed !== true) throw new Error("confirmation_required");
  const data = validateConfirmedIntake(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO aca_intake_requests (tenant_id, call_sid, cluster_id, intent, slots)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (tenant_id, call_sid) DO NOTHING
       RETURNING id, tenant_id, call_sid, status, confirmed_at`,
      [data.tenantId, data.callSid, data.clusterId, data.intent, JSON.stringify(data.slots)]
    );
    let request = inserted.rows[0];
    if (!request) {
      const existing = await client.query(
        `SELECT id, tenant_id, call_sid, status, confirmed_at
         FROM aca_intake_requests WHERE tenant_id = $1 AND call_sid = $2`,
        [data.tenantId, data.callSid]
      );
      request = existing.rows[0];
    }
    if (!request) throw new Error("intake_conflict_not_found");
    // Persist intent to notify in the SAME transaction as the confirmed intake.
    // This does not dispatch anything or imply the business has been notified.
    await client.query(
      `INSERT INTO aca_notification_outbox (tenant_id, intake_request_id, event_type)
       VALUES ($1, $2, 'intake.confirmed')
       ON CONFLICT (intake_request_id, event_type) DO NOTHING`,
      [data.tenantId, request.id]
    );
    await client.query("COMMIT");
    return { created: Boolean(inserted.rows[0]), request };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { validateConfirmedIntake, saveConfirmedIntake };
