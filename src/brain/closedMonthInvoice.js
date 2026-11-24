"use strict";
// Internal closed-period invoicing; pricing must be supplied by trusted configuration.
async function invoiceClosedMonth(pool,{tenantId,year,month,minuteRateCents,tokenRateMicros}){
 if(!Number.isSafeInteger(tenantId)||tenantId<=0||!Number.isInteger(year)||year<2000||year>9999||!Number.isInteger(month)||month<1||month>12||!Number.isSafeInteger(minuteRateCents)||minuteRateCents<0||!Number.isSafeInteger(tokenRateMicros)||tokenRateMicros<0)throw Error("INVALID_INVOICE_INPUT");
 const start=new Date(Date.UTC(year,month-1,1)),end=new Date(Date.UTC(year,month,1));
 if(end>new Date())throw Error("PERIOD_NOT_CLOSED");
 const client=await pool.connect();
 try{
 await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
 await client.query("SELECT pg_advisory_xact_lock($1::integer,$2::integer)",[tenantId,year*12+month]);
 const result=await client.query("WITH price AS (SELECT minute_rate_cents,token_rate_micros FROM public.aca_period_pricing WHERE tenant_id=$1 AND period_start=$2 AND minute_rate_cents=$4 AND token_rate_micros=$5), usage AS (SELECT COALESCE(SUM(quantity) FILTER(WHERE unit='voice_seconds'),0) AS seconds,COALESCE(SUM(quantity) FILTER(WHERE unit='ai_tokens'),0) AS tokens FROM public.analytics_events WHERE tenant_id=$1 AND event_type='ACA_VERIFIED_USAGE' AND created_at >= $2 AND created_at < $3), claimed AS (INSERT INTO public.aca_invoice_periods(tenant_id,period_start) SELECT $1,$2 FROM usage CROSS JOIN price WHERE (seconds>0 OR tokens>0) AND NOT EXISTS (SELECT 1 FROM public.billing_invoices WHERE tenant_id=$1 AND period_start < $3 AND period_end > $2) ON CONFLICT DO NOTHING RETURNING tenant_id) INSERT INTO public.billing_invoices(tenant_id,usage_minutes,ai_tokens,amount_usd,period_start,period_end,status) SELECT claimed.tenant_id,usage.seconds/60,usage.tokens,ROUND((usage.seconds*price.minute_rate_cents::numeric/6000)+(usage.tokens*price.token_rate_micros::numeric/1000000),2),$2,$3,'unpaid' FROM claimed CROSS JOIN usage CROSS JOIN price RETURNING id,amount_usd,status",[tenantId,start,end,minuteRateCents,tokenRateMicros]);
 await client.query("COMMIT");
 return result.rows[0]||null;
 }catch(err){try{await client.query("ROLLBACK");}catch{}throw err;}finally{client.release();}
}
module.exports={invoiceClosedMonth};
