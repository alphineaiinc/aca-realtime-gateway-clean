"use strict";
// Explicit invocation only. SMTP acceptance is at-least-once, not exactly-once.
async function deliverOne({pool,sendMail}){
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const {rows}=await client.query("SELECT o.event_id,o.invoice_id,o.tenant_id,r.email FROM public.aca_billing_notification_outbox o JOIN public.aca_notification_recipients r ON r.tenant_id=o.tenant_id WHERE o.delivered_at IS NULL AND o.next_attempt_at<=NOW() AND o.attempts<8 AND r.is_active AND r.verified_at IS NOT NULL ORDER BY o.created_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED");
  if(!rows.length){await client.query("COMMIT");return false;}
  const row=rows[0];
  let accepted=false;
  try{
   if(!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(row.email))throw Error("INVALID_RECIPIENT");
   const result=await sendMail({to:row.email,subject:"Alphine AI billing update",text:"A payment update is available in your Alphine AI account. Sign in to review your invoice.",messageId:"<aca-billing-"+require("node:crypto").createHash("sha256").update(row.event_id).digest("hex")+"@alphineai.com>"});
   accepted=Array.isArray(result?.accepted)&&result.accepted.includes(row.email);
  }catch{}
  if(accepted)await client.query("UPDATE public.aca_billing_notification_outbox SET delivered_at=NOW(),attempts=attempts+1 WHERE event_id=$1",[row.event_id]);
  else await client.query("UPDATE public.aca_billing_notification_outbox SET attempts=attempts+1,next_attempt_at=NOW()+INTERVAL '5 minutes' * power(2,attempts) WHERE event_id=$1",[row.event_id]);
  await client.query("COMMIT");return accepted?"delivered":"retry";
 }catch{try{await client.query("ROLLBACK");}catch{}throw Error("BILLING_NOTIFICATION_FAILED");}
 finally{client.release();}
}
module.exports={deliverOne};
