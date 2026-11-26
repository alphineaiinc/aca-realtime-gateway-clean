"use strict";
const { isValidatedRoutingContext } = require("./tenantResolver");
async function saveConfirmedRequest(context, intentName, slots, query = (...args) => require("../db/pool").query(...args)) {
  if (!isValidatedRoutingContext(context) || !/^CA[0-9a-f]{32}$/i.test(context.callSid)) throw new Error("INVALID_REQUEST_CONTEXT");
  const intent = context.schema.intents.find(i => i.intent === intentName);
  if (!intent) throw new Error("INVALID_REQUEST_INTENT");
  const details = {};
  for (const key of [...intent.required_slots, ...intent.optional_slots]) {
    const value = slots?.[key];
    if ((typeof value === "string" && value.trim() && value.length <= 4000) || (typeof value === "number" && Number.isFinite(value))) details[key] = value;
  }
  if (intent.required_slots.some(key => !Object.hasOwn(details,key))) throw new Error("INCOMPLETE_REQUEST");
  const result = await query(`WITH saved AS (
    INSERT INTO public.aca_customer_requests (tenant_id, call_sid, workflow_id, workflow_version, intent, details)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)
    ON CONFLICT (tenant_id, call_sid) DO UPDATE SET details = EXCLUDED.details
      WHERE aca_customer_requests.details = EXCLUDED.details AND aca_customer_requests.intent = EXCLUDED.intent
      AND aca_customer_requests.workflow_id = EXCLUDED.workflow_id AND aca_customer_requests.workflow_version = EXCLUDED.workflow_version
    RETURNING id, tenant_id
  ), queued AS (
    INSERT INTO public.aca_request_outbox (request_id, tenant_id)
    SELECT id, tenant_id FROM saved ON CONFLICT (request_id) DO NOTHING
  ) SELECT id FROM saved`, [context.tenantId,context.callSid,context.clusterId,context.workflowVersion,intentName,JSON.stringify(details)]);
  if (result.rows.length !== 1) throw new Error("REQUEST_CONFLICT");
  return result.rows[0].id;
}
module.exports = { saveConfirmedRequest };
