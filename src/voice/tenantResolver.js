"use strict";
const { validateWorkflowSchema } = require("./clusterSchemaLoader");
const validated = new WeakSet();
function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
function normalizePhoneNumber(value) {
  // No country inference: routing keys must already be canonical E.164.
  return typeof value === "string" && /^\+[1-9]\d{1,14}$/.test(value) ? value : null;
}
const failure = (reason) => ({ ok: false, reason });
function isValidatedRoutingContext(context) {
  return !!context && validated.has(context);
}
function createTenantResolver({ query }) {
  return async function resolveTenantFromVoiceContext(input = {}) {
    if (["tenantId", "tenant_id", "businessId", "business_id", "customParameters"].some((k) => input[k] !== undefined)) {
      return failure("UNTRUSTED_IDENTIFIER");
    }
    const calledNumber = normalizePhoneNumber(input.calledNumber);
    if (!calledNumber) return failure("INVALID_CALLED_NUMBER");
    try {
      const phones = await query(`SELECT p.tenant_id, p.is_active, t.preferred_lang, t.region
        FROM public.tenant_phone_numbers p
        JOIN public.master_tenants t ON t.id = p.tenant_id
        WHERE p.phone_number = $1 LIMIT 2`, [calledNumber]);
      if (phones.rows.length !== 1) return failure(phones.rows.length ? "AMBIGUOUS_NUMBER" : "UNKNOWN_NUMBER");
      const tenant = phones.rows[0];
      if (tenant.is_active !== true) return failure("INACTIVE_NUMBER");
      if (!Number.isInteger(tenant.tenant_id) || tenant.tenant_id <= 0) return failure("INVALID_TENANT");
      const mappings = await query(`SELECT c.workflow_id, c.workflow_version, c.is_active,
          d.is_active AS definition_active, d.schema_json
        FROM public.tenant_workflow_configs c
        JOIN public.voice_workflow_definitions d ON d.workflow_id = c.workflow_id AND d.version = c.workflow_version
        WHERE c.tenant_id = $1 LIMIT 2`, [tenant.tenant_id]);
      if (mappings.rows.length !== 1) return failure(mappings.rows.length ? "AMBIGUOUS_WORKFLOW" : "MISSING_WORKFLOW");
      const mapping = mappings.rows[0];
      if (mapping.is_active !== true || mapping.definition_active !== true) return failure("INACTIVE_WORKFLOW");
      let schema;
      try {
        schema = validateWorkflowSchema(mapping.schema_json);
        if (schema.cluster_id !== mapping.workflow_id || schema.version !== mapping.workflow_version) throw new Error();
      } catch { return failure("INVALID_WORKFLOW_SCHEMA"); }
      const context = deepFreeze({ ok: true, tenantId: tenant.tenant_id, businessId: null,
        clusterId: mapping.workflow_id, workflowVersion: mapping.workflow_version,
        calledNumber, callSid: input.callSid, accountSid: input.accountSid,
        languageCode: tenant.preferred_lang || "en-US", region: tenant.region || null,
        schema: JSON.parse(JSON.stringify(schema)) });
      validated.add(context);
      return context;
    } catch { return failure("ROUTING_UNAVAILABLE"); }
  };
}
async function resolveTenantFromVoiceContext(input) {
  // Lazy import keeps pure validation/tests free of database startup side effects.
  return createTenantResolver({ query: (...args) => require("../db/pool").query(...args) })(input);
}
module.exports = { normalizePhoneNumber, createTenantResolver, resolveTenantFromVoiceContext, isValidatedRoutingContext };
