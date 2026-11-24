const test=require('node:test');
const assert=require('node:assert/strict');
const {createStripeInvoiceSettlementStore}=require('../src/security/stripeInvoiceSettlementStore');
test('settlement transaction uses trusted tenant and invoice, rejects replay and test mode',async()=>{
 const calls=[];let settled=null;
 const c={release(){},async query(sql,args){calls.push([sql,args]);if(sql.startsWith('SELECT'))return {rows:[{stripe_customer_id:'cus_a',amount_cents:'100',currency:'usd',live_mode:true,invoice_id:5,tenant_id:7,settled_event_id:settled}]};if(sql.startsWith('UPDATE billing'))return {rowCount:1};if(sql.startsWith('UPDATE aca'))settled=args[0];return {};}};
 const s=createStripeInvoiceSettlementStore({connect:async()=>c});
 const f={stripeInvoiceId:'in_a',stripeCustomerId:'cus_a',amountCents:100,currency:'usd',liveMode:true,eventId:'evt_a'};
 assert.equal(await s.settle({...f,liveMode:false}),'rejected');
 assert.equal(calls.length,0);
 assert.equal(await s.settle({...f,stripeCustomerId:'cus_b'}),'rejected');
 assert.equal(await s.settle(f),'settled');
 assert.deepEqual(calls.find(x=>x[0].startsWith('UPDATE billing'))[1],['in_a',5,7,100]);
 assert.equal(await s.settle(f),'duplicate');
 assert.equal(await s.settle({...f,eventId:'evt_b'}),'rejected');
 assert.equal(calls.filter(x=>x[0].startsWith('UPDATE billing')).length,1);
});
