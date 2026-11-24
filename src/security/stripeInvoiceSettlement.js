'use strict';
// Caller must supply a signature-verified event and trusted, persisted invoice mapping.
// Store must atomically compare and settle the mapped invoice, never trust event metadata.
function createStripeInvoiceSettlement({store,liveMode=false}) {
 if(!store || typeof store.settle!=='function') throw new TypeError('Settlement store required');
 return async function settleVerifiedEvent(event) {
  if(event?.type!=='invoice.payment_succeeded') return 'ignored';
  const invoice=event.data?.object;
  if(event.livemode!==liveMode || event.account || invoice?.object!=='invoice' ||
     invoice.status!=='paid' || invoice.paid!==true || invoice.paid_out_of_band!==false ||
     typeof invoice.id!=='string' || !/^in_[A-Za-z0-9]+$/.test(invoice.id) ||
     typeof invoice.customer!=='string' || !/^cus_[A-Za-z0-9]+$/.test(invoice.customer) ||
     invoice.currency!=='usd' || !Number.isSafeInteger(invoice.amount_paid) || invoice.amount_paid<=0 ||
     invoice.amount_due!==invoice.amount_paid || invoice.amount_remaining!==0 ||
     typeof event.id!=='string' || !/^evt_[A-Za-z0-9_]{1,200}$/.test(event.id)) return 'rejected';
  return store.settle({stripeInvoiceId:invoice.id,stripeCustomerId:invoice.customer,
   amountCents:invoice.amount_paid,currency:invoice.currency,eventId:event.id,liveMode});
 };
}
module.exports={createStripeInvoiceSettlement};
