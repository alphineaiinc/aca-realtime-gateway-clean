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
  if (!pool || typeof pool.query !== "function") throw new Error("database_unavailable");
  if (input?.confirmed !== true) throw new Error("confirmation_required");
  const data = validateConfirmedIntake(input);
  const result = await pool.query(
    `INSERT INTO aca_intake_requests (tenant_id, call_sid, cluster_id, intent, slots)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (tenant_id, call_sid) DO NOTHING
     RETURNING id, tenant_id, call_sid, status, confirmed_at`,
    [data.tenantId, data.callSid, data.clusterId, data.intent, JSON.stringify(data.slots)]
  );
  if (result.rows[0]) return { created: true, request: result.rows[0] };
  const existing = await pool.query(
    `SELECT id, tenant_id, call_sid, status, confirmed_at
     FROM aca_intake_requests WHERE tenant_id = $1 AND call_sid = $2`,
    [data.tenantId, data.callSid]
  );
  if (!existing.rows[0]) throw new Error("intake_conflict_not_found");
  return { created: false, request: existing.rows[0] };
}

module.exports = { validateConfirmedIntake, saveConfirmedIntake };
