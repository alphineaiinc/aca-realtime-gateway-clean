'use strict';
function createStripeInvoiceSettlementStore(pool){
 return {async settle(f){
  // Test-mode events must never mark the commercial invoice ledger paid.
  if(f.liveMode!==true) return 'rejected';
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   const m=await c.query('SELECT * FROM aca_stripe_invoice_mapping WHERE stripe_invoice_id=$1 FOR UPDATE',[f.stripeInvoiceId]);
   const r=m.rows[0];
   if(!r || r.stripe_customer_id!==f.stripeCustomerId || String(r.amount_cents)!==String(f.amountCents) || r.currency!==f.currency || r.live_mode!==f.liveMode){
    await c.query('ROLLBACK');return 'rejected';
   }
   if(r.settled_event_id){
    await c.query('ROLLBACK');return r.settled_event_id===f.eventId?'duplicate':'rejected';
   }
   const u=await c.query("UPDATE billing_invoices SET status='paid',paid_at=NOW(),payment_method='stripe',payment_reference=$1 WHERE id=$2 AND tenant_id=$3 AND status='unpaid' AND amount_usd*100=$4 RETURNING id",[f.stripeInvoiceId,r.invoice_id,r.tenant_id,f.amountCents]);
   if(u.rowCount!==1){await c.query('ROLLBACK');return 'rejected';}
   await c.query('UPDATE aca_stripe_invoice_mapping SET settled_event_id=$1,settled_at=NOW() WHERE stripe_invoice_id=$2',[f.eventId,f.stripeInvoiceId]);
   await c.query('COMMIT');return 'settled';
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }};
}
module.exports={createStripeInvoiceSettlementStore};
