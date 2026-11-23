"use strict";
// Explicit invocation only. Never creates Stripe charges or sends mail.
async function reconcileOne(pool) {
 const client=await pool.connect();
 try {
  await client.query("BEGIN");
  const {rows}=await client.query("SELECT event_id,payload FROM public.aca_stripe_event_inbox WHERE reconciled_at IS NULL AND payload->>'type'='invoice.payment_succeeded' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED");
  if(!rows.length){await client.query("COMMIT");return false;}
  const row=rows[0], invoice=row.payload?.data?.object;
  let outcome="unmatched";
  if(row.payload?.livemode===true && invoice?.object==="invoice" && invoice.status==="paid" && invoice.paid===true && invoice.currency==="usd" && Number.isSafeInteger(invoice.amount_paid) && invoice.amount_paid>0 && typeof invoice.id==="string" && typeof invoice.customer==="string"){
   const result=await client.query(
    "UPDATE public.billing_invoices i SET status='paid',paid_at=NOW(),payment_method='stripe',payment_reference=$1 FROM public.aca_stripe_invoice_bindings b WHERE b.stripe_invoice_id=$1 AND b.stripe_customer_id=$2 AND b.amount_cents=$3 AND b.livemode=$4 AND i.id=b.invoice_id AND i.tenant_id=b.tenant_id AND i.amount_usd*100=b.amount_cents AND i.status='unpaid' RETURNING i.id,i.tenant_id",
    [invoice.id,invoice.customer,invoice.amount_paid,row.payload.livemode===true]);
   if(result.rowCount===1){
    const settled=result.rows[0];
    await client.query("INSERT INTO public.aca_billing_notification_outbox(event_id,invoice_id,tenant_id) VALUES($1,$2,$3) ON CONFLICT(event_id) DO NOTHING",[row.event_id,settled.id,settled.tenant_id]);
    outcome="settled";
   }
  }
  await client.query("UPDATE public.aca_stripe_event_inbox SET reconciled_at=NOW(),reconciliation_outcome=$2 WHERE event_id=$1",[row.event_id,outcome]);
  await client.query("COMMIT");return outcome;
 }catch{try{await client.query("ROLLBACK");}catch{}throw Error("STRIPE_RECONCILIATION_FAILED");}
 finally{client.release();}
}
module.exports={reconcileOne};
