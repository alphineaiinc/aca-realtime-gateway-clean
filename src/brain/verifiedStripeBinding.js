"use strict";
const {bindInvoice}=require("./stripeInvoiceBinding");
// Internal provisioning only. Caller supplies a trusted Stripe SDK client.
async function verifyAndBindInvoice(pool,stripe,input){
 const {invoiceId,tenantId,stripeInvoiceId,amountCents,livemode}=input;
 if(typeof stripeInvoiceId!=="string"||!/^in_[A-Za-z0-9]+$/.test(stripeInvoiceId)||!Number.isSafeInteger(tenantId)||tenantId<=0||!Number.isSafeInteger(invoiceId)||invoiceId<=0||!Number.isSafeInteger(amountCents)||amountCents<=0||typeof livemode!=="boolean")throw Error("INVALID_BINDING");
 const invoice=await stripe.invoices.retrieve(stripeInvoiceId);
 if(!invoice||invoice.id!==stripeInvoiceId||invoice.object!=="invoice"||invoice.livemode!==livemode||invoice.currency!=="usd"||invoice.status!=="open"||invoice.amount_due!==amountCents||invoice.amount_remaining!==amountCents||invoice.amount_paid!==0||typeof invoice.customer!=="string"||!/^cus_[A-Za-z0-9]+$/.test(invoice.customer))throw Error("PROVIDER_INVOICE_MISMATCH");
 return bindInvoice(pool,{invoiceId,tenantId,stripeInvoiceId,stripeCustomerId:invoice.customer,amountCents,livemode});
}
module.exports={verifyAndBindInvoice};
