"use strict";
// Explicit invocation only. Reservation commits BEFORE Gmail: an ambiguous send
// is never automatically retried. Never treat Message-ID as provider idempotency.
const CLAIM=`WITH eligible AS (
 SELECT o.request_id,o.tenant_id,r.email
 FROM public.aca_request_outbox o
 JOIN public.aca_notification_recipients r ON r.tenant_id=o.tenant_id
 WHERE o.delivered_at IS NULL AND r.is_active AND r.verified_at IS NOT NULL
   AND r.email ~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\\.[^[:space:]@,;<>]+$'
   AND (($1::boolean IS FALSE AND current_database() = $4::text AND current_database() <> 'aca_product_staging') OR ($1::boolean IS TRUE AND current_database() = 'aca_product_staging' AND o.tenant_id=$2::bigint AND o.request_id=$3::bigint AND r.email=$4::text))
   AND NOT EXISTS (SELECT 1 FROM public.aca_request_email_reservations s
     WHERE s.request_id=o.request_id AND s.tenant_id=o.tenant_id)
 ORDER BY o.created_at,o.request_id LIMIT 1
)
INSERT INTO public.aca_request_email_reservations(request_id,tenant_id,recipient,message_id,staging_attempt)
 SELECT request_id,tenant_id,email,
 '<aca-request-' || tenant_id::text || '-' || request_id::text || '@alphineai.com>',CASE WHEN $1::boolean THEN TRUE ELSE NULL END
 FROM eligible ON CONFLICT DO NOTHING
 RETURNING request_id,tenant_id,recipient AS email,message_id`;
async function deliverOne({pool,sendMail}) {
 // Commercial delivery requires explicit release configuration and the pinned service.
 const staging=process.env.ACA_STAGING_EMAIL_ONLY==="true";
 const database=process.env.ACA_PRODUCTION_EMAIL_DATABASE;
 if(!staging && (process.env.ACA_PRODUCTION_EMAIL_ENABLED!=="true" ||
   process.env.RENDER_SERVICE_ID!=="srv-d3rfh8umcj7s73cj28c0" ||
   !/^[a-zA-Z0-9_]{1,63}$/.test(database||"") || database==="aca_product_staging" ||
   process.env.ACA_STAGING_ACCEPTANCE_RUN==="true" || process.env.ACA_STAGING_ACCEPTANCE_SEND==="true")) return false;
 const tenant=process.env.ACA_STAGING_EMAIL_TENANT_ID;
 const request=process.env.ACA_STAGING_EMAIL_REQUEST_ID;
 const recipient=process.env.ACA_STAGING_EMAIL_RECIPIENT;
 if(staging && (process.env.ACA_STAGING_EMAIL_ONLY!=="true" ||
   !/^[1-9][0-9]{0,17}$/.test(tenant||"") || !/^[1-9][0-9]{0,17}$/.test(request||"") ||
   !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient||""))) return false;
 // Construct the local transport before consuming a durable entitlement.
 let sender;
 try{sender=sendMail||createNotificationSender();if(typeof sender!=="function")throw Error("INVALID_SENDER");}
 catch{throw Error("REQUEST_TRANSPORT_CONFIGURATION_INVALID");}
 const client=await pool.connect();
 let row;
 try{
  // A single atomic statement commits the send entitlement before provider I/O.
  const {rows}=await client.query(CLAIM,[staging,staging?tenant:null,staging?request:null,staging?recipient:database]);
  row=rows[0];
 }catch{throw Error("REQUEST_RESERVATION_FAILED");}
 finally{client.release();}
 if(!row)return false;
 try{
  const result=await sender({
   to:row.email,subject:"New Alphine AI customer request",
   text:"A new customer request is waiting in your Alphine AI account. Sign in to review it.",
   messageId:row.message_id
  });
  if(!Array.isArray(result?.accepted)||!result.accepted.includes(row.email))throw Error("DELIVERY_NOT_ACCEPTED");
 }catch{
  // The provider may have accepted mail before a timeout; no retry is safe.
  await markReservation(pool,row,"uncertain");
  throw Error("REQUEST_NOTIFICATION_UNCERTAIN");
 }
 try{
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const reservationAck=await client.query(`UPDATE public.aca_request_email_reservations
     SET state='sent',finished_at=now()
     WHERE request_id=$1 AND tenant_id=$2 AND state='reserved'`,[row.request_id,row.tenant_id]);
   if(reservationAck.rowCount!==1)throw Error("REQUEST_ACK_FAILED");
   const outboxAck=await client.query(`UPDATE public.aca_request_outbox SET delivered_at=now()
     WHERE request_id=$1 AND tenant_id=$2 AND delivered_at IS NULL`,[row.request_id,row.tenant_id]);
   if(outboxAck.rowCount!==1)throw Error("REQUEST_ACK_FAILED");
   await client.query("COMMIT");
  }catch{try{await client.query("ROLLBACK");}catch{}throw Error("REQUEST_ACK_FAILED");}
  finally{client.release();}
 }catch{throw Error("REQUEST_ACK_FAILED");}
 return true;
}
async function markReservation(pool,row,state){
 try{await pool.query(`UPDATE public.aca_request_email_reservations
 SET state=$3,finished_at=now() WHERE request_id=$1 AND tenant_id=$2 AND state='reserved'`,
 [row.request_id,row.tenant_id,state]);}catch{/* Persisted reserved row already blocks retries. */}
}
function createSmtpSender(env=process.env){
 if(!env.SMTP_HOST||!env.SMTP_USER||!env.SMTP_PASS||!env.SMTP_FROM) throw Error("SMTP_NOT_CONFIGURED");
 const transport=require("nodemailer").createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||465),secure:true,tls:{rejectUnauthorized:true},auth:{user:env.SMTP_USER,pass:env.SMTP_PASS},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000});
 return mail=>transport.sendMail({...mail,from:env.SMTP_FROM});
}
function createMailSender(env=process.env){
 // Login/onboarding must not consume the controlled notification acceptance budget.
 if(env.ACA_STAGING_EMAIL_ONLY==="true")throw Error("STAGING_AUTH_EMAIL_DISABLED");
 return createNotificationSender(env);
}
function createNotificationSender(env=process.env){
 if(env.ACA_EMAIL_TRANSPORT==="gmail")return require("./gmailSender").createGmailSender(env);
 if(!env.ACA_EMAIL_TRANSPORT||env.ACA_EMAIL_TRANSPORT==="smtp")return createSmtpSender(env);
 throw Error("EMAIL_TRANSPORT_INVALID");
}
module.exports={deliverOne,createSmtpSender,createMailSender};
