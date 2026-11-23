"use strict";
// Explicit invocation only; no scheduler or provider activation on import.
async function deliverOne({pool,sendMail}) {
 const client=await pool.connect();
 try {
  await client.query("BEGIN");
  const {rows}=await client.query(`SELECT o.request_id,o.tenant_id,r.email
    FROM public.aca_request_outbox o
    JOIN public.aca_notification_recipients r ON r.tenant_id=o.tenant_id
    WHERE o.delivered_at IS NULL AND r.is_active AND r.verified_at IS NOT NULL
    ORDER BY o.created_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED`);
  if(!rows.length){await client.query("COMMIT");return false;}
  const row=rows[0];
  if(!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(row.email)) throw Error("INVALID_RECIPIENT");
  // No customer PII in email; authenticated business access is required to view details.
  const result=await sendMail({to:row.email,subject:"New Alphine AI customer request",text:"A new customer request is waiting in your Alphine AI account. Sign in to review it.",messageId:"<aca-request-"+row.request_id+"@alphineai.com>"});
  if(!Array.isArray(result?.accepted)||!result.accepted.includes(row.email)) throw Error("DELIVERY_NOT_ACCEPTED");
  await client.query("UPDATE public.aca_request_outbox SET delivered_at=NOW() WHERE request_id=$1 AND tenant_id=$2",[row.request_id,row.tenant_id]);
  await client.query("COMMIT");return true;
 }catch{try{await client.query("ROLLBACK");}catch{}throw Error("REQUEST_NOTIFICATION_FAILED");}
 finally{client.release();}
}
function createSmtpSender(env=process.env){
 if(!env.SMTP_HOST||!env.SMTP_USER||!env.SMTP_PASS||!env.SMTP_FROM) throw Error("SMTP_NOT_CONFIGURED");
 const transport=require("nodemailer").createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||465),secure:true,tls:{rejectUnauthorized:true},auth:{user:env.SMTP_USER,pass:env.SMTP_PASS},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000});
 return mail=>transport.sendMail({...mail,from:env.SMTP_FROM});
}
module.exports={deliverOne,createSmtpSender};
