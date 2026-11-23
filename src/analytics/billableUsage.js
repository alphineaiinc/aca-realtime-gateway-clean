"use strict";
// Internal trusted metering only; not a public HTTP handler.
async function recordUsage(pool,{tenantId,eventId,kind,quantity}){
 if(!Number.isSafeInteger(tenantId)||tenantId<=0||typeof eventId!=="string"||!/^[A-Za-z0-9:_-]{1,128}$/.test(eventId)||!["voice_seconds","ai_tokens"].includes(kind)||!Number.isSafeInteger(quantity)||quantity<=0)throw Error("INVALID_USAGE");
 const result=await pool.query("WITH claimed AS (INSERT INTO public.aca_billable_usage_keys(tenant_id,event_id,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING tenant_id) INSERT INTO public.analytics_events(tenant_id,event_type,quantity,unit,meta) SELECT tenant_id,'ACA_VERIFIED_USAGE',$4,$3,jsonb_build_object('event_id',$2::text) FROM claimed RETURNING id",[tenantId,eventId,kind,quantity]);
 return {stored:result.rowCount===1};
}
async function summarizeUsage(pool,{tenantId,start,end}){
 if(!Number.isSafeInteger(tenantId)||tenantId<=0||!(start instanceof Date)||!(end instanceof Date)||!Number.isFinite(+start)||!Number.isFinite(+end)||start>=end)throw Error("INVALID_PERIOD");
 const {rows}=await pool.query("SELECT COALESCE(SUM(quantity) FILTER(WHERE unit='voice_seconds'),0) AS voice_seconds,COALESCE(SUM(quantity) FILTER(WHERE unit='ai_tokens'),0) AS ai_tokens FROM public.analytics_events WHERE tenant_id=$1 AND event_type='ACA_VERIFIED_USAGE' AND created_at >= $2 AND created_at < $3",[tenantId,start,end]);
 return rows[0];
}
module.exports={recordUsage,summarizeUsage};
