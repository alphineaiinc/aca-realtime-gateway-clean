"use strict";
// Internal verified provider evidence only. Does not generate an adjustment or invoice.
async function queueLateUsage(pool,{tenantId,eventId,kind,quantity,occurredAt}){
 if(!Number.isSafeInteger(tenantId)||tenantId<=0||typeof eventId!=="string"||!/^[A-Za-z0-9:_-]{1,128}$/.test(eventId)||!["voice_seconds","ai_tokens"].includes(kind)||!Number.isSafeInteger(quantity)||quantity<=0||!(occurredAt instanceof Date)||!Number.isFinite(+occurredAt)||+occurredAt>Date.now())throw Error("INVALID_LATE_USAGE");
 const args=[eventId,kind,tenantId,quantity,occurredAt];
 const result=await pool.query("WITH claimed AS (INSERT INTO public.aca_billable_usage_keys(tenant_id,event_id,kind) VALUES($3,$1,$2) ON CONFLICT DO NOTHING RETURNING tenant_id) INSERT INTO public.aca_usage_reconciliation(event_id,kind,tenant_id,quantity,occurred_at) SELECT $1,$2,tenant_id,$4,$5 FROM claimed RETURNING event_id",args);
 if(result.rowCount===1)return {queued:true};
 const prior=await pool.query("SELECT 1 FROM public.aca_usage_reconciliation WHERE event_id=$1 AND kind=$2 AND tenant_id=$3 AND quantity=$4 AND occurred_at=$5",args);
 if(prior.rowCount!==1)throw Error("CONFLICTING_LATE_USAGE");
 return {queued:false};
}
module.exports={queueLateUsage};
