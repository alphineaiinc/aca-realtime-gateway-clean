"use strict";
// No HTTP endpoint. Disabled by default; only the existing staging service may run.
const SERVICE="srv-dc2ffvm8bjmc73fhn8j0";
const RECIPIENT="contact@alphineai.com";
async function run({env=process.env,pool,fetcher=globalThis.fetch,deliver=require("./requestNotificationWorker").deliverOne}={}){
 if(env.ACA_STAGING_ACCEPTANCE_RUN!=="true")return "disabled";
 if(env.RENDER_SERVICE_ID!==SERVICE||env.ACA_STAGING_EMAIL_ONLY!=="true"||
 env.ACA_STAGING_EMAIL_TENANT_ID!=="6"||env.ACA_STAGING_EMAIL_REQUEST_ID!=="4"||
 env.ACA_STAGING_EMAIL_RECIPIENT!==RECIPIENT||env.ACA_EMAIL_TRANSPORT!=="gmail")return "scope-denied";
 if(!env.GMAIL_CLIENT_ID||!env.GMAIL_CLIENT_SECRET||!env.GMAIL_REFRESH_TOKEN||env.GMAIL_FROM!==RECIPIENT)return "transport-unconfigured";
 const db=await pool.query("SELECT current_database() AS db");
 if(db.rows[0]?.db!=="aca_product_staging")return "database-denied";
 const fixture=await pool.query("SELECT 1 FROM public.aca_request_outbox o JOIN public.aca_notification_recipients r USING(tenant_id) JOIN public.master_tenants t ON t.id=o.tenant_id WHERE o.request_id=4 AND o.tenant_id=6 AND o.delivered_at IS NULL AND r.email=$1 AND r.is_active AND r.verified_at IS NOT NULL AND t.business_name='ACA controlled email acceptance fixture' AND NOT EXISTS (SELECT 1 FROM public.aca_request_email_reservations WHERE staging_attempt IS TRUE OR (request_id=4 AND tenant_id=6))",[RECIPIENT]);
 if(fixture.rows.length!==1)return "fixture-denied";
 // Preflight OAuth without sending mail or reserving the attempt.
 try{
 const response=await fetcher("https://oauth2.googleapis.com/token",{method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:"refresh_token"}).toString()});
 if(!response.ok){await response.body?.cancel();return "oauth-denied";}
 const token=await response.json();
 if(typeof token.access_token!=="string"||!token.access_token||/[\r\n]/.test(token.access_token))return "oauth-denied";
 }catch{return "oauth-denied";}
 if(env.ACA_STAGING_ACCEPTANCE_SEND!=="true")return "ready";
 const sender=require("./gmailSender").createGmailSender(env,fetcher);
 return await deliver({pool,sendMail:sender})?"sent":"not-claimed";
}
module.exports={run};
