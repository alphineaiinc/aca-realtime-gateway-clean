'use strict';
// Internal service only. Never expose to a customer-controlled route.
// Caller supplies trusted tenant/customer binding from an authorized provisioning workflow.
function createTrustedInvoiceMapping({pool,stripe}){
 return async function provision({tenantId,invoiceId,stripeInvoiceId,stripeCustomerId}){
  if(![tenantId,invoiceId].every(x=>Number.isSafeInteger(x)&&x>0)||!/^in_[A-Za-z0-9]+$/.test(stripeInvoiceId)||!/^cus_[A-Za-z0-9]+$/.test(stripeCustomerId))throw Error('Invalid mapping identity');
  const v=await stripe.invoices.retrieve(stripeInvoiceId);
  if(v.id!==stripeInvoiceId||v.customer!==stripeCustomerId||v.livemode!==true||v.currency!=='usd'||v.status!=='open'||!Number.isSafeInteger(v.amount_due)||v.amount_due<=0)throw Error('Provider invoice mismatch');
  const result=await pool.query(`INSERT INTO aca_stripe_invoice_mapping (stripe_invoice_id,stripe_customer_id,invoice_id,tenant_id,amount_cents,currency,live_mode)
 SELECT $1,$2,id,tenant_id,$5,'usd',true FROM billing_invoices
 WHERE id=$3 AND tenant_id=$4 AND status='unpaid' AND amount_usd*100=$5
 ON CONFLICT DO NOTHING RETURNING stripe_invoice_id`,[stripeInvoiceId,stripeCustomerId,invoiceId,tenantId,v.amount_due]);
  return result.rowCount===1?'created':'not_created';
 };
}
module.exports={createTrustedInvoiceMapping};
