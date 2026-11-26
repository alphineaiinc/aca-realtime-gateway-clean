"use strict";
// Trusted internal caller only; never expose this function as a customer route.
async function bindInvoice(pool,{invoiceId,tenantId,stripeInvoiceId,stripeCustomerId,amountCents,livemode}){
 if(!Number.isSafeInteger(invoiceId)||invoiceId<=0||!Number.isSafeInteger(tenantId)||tenantId<=0||!Number.isSafeInteger(amountCents)||amountCents<=0||typeof livemode!=="boolean"||!/^in_[A-Za-z0-9]+$/.test(stripeInvoiceId)||!/^cus_[A-Za-z0-9]+$/.test(stripeCustomerId))throw Error("INVALID_BINDING");
 const result=await pool.query("INSERT INTO public.aca_stripe_invoice_bindings(stripe_invoice_id,stripe_customer_id,invoice_id,tenant_id,amount_cents,livemode) SELECT $1,$2,id,tenant_id,$5::bigint,$6 FROM public.billing_invoices WHERE id=$3 AND tenant_id=$4 AND amount_usd*100=$5::bigint AND status='unpaid' AND EXISTS (SELECT 1 FROM public.aca_stripe_customer_identity c WHERE c.tenant_id=$4 AND c.stripe_customer_id=$2 AND c.livemode=$6) ON CONFLICT DO NOTHING RETURNING invoice_id",[stripeInvoiceId,stripeCustomerId,invoiceId,tenantId,amountCents,livemode]);
 if(result.rowCount!==1)throw Error("BINDING_REJECTED");
 return result.rows[0];
}
module.exports={bindInvoice};
