const test=require('node:test');
const assert=require('node:assert/strict');
const {createStripeInvoiceSettlement}=require('../src/security/stripeInvoiceSettlement');
test('settlement only forwards verified invoice facts and rejects invalid events',async()=>{
 const calls=[];
 const run=createStripeInvoiceSettlement({store:{settle:async x=>{calls.push(x);return 'settled';}}});
 const invoice={object:'invoice',id:'in_test',customer:'cus_test',status:'paid',paid:true,paid_out_of_band:false,currency:'usd',amount_paid:1000,amount_due:1000,amount_remaining:0,metadata:{tenant_id:999}};
 const event={id:'evt_test',type:'invoice.payment_succeeded',livemode:false,data:{object:invoice}};
 for(const patch of [{paid:false},{paid_out_of_band:true},{amount_paid:999},{amount_remaining:1},{currency:'cad'},{customer:null},{amount_paid:0}]){
  assert.equal(await run({...event,data:{object:{...invoice,...patch}}}),'rejected');
 }
 assert.equal(await run({...event,livemode:true}),'rejected');
 assert.equal(await run({...event,account:'acct_other'}),'rejected');
 assert.equal(await run({...event,type:'invoice.created'}),'ignored');
 assert.equal(calls.length,0);
 assert.equal(await run(event),'settled');
 assert.deepEqual(calls,[{stripeInvoiceId:'in_test',stripeCustomerId:'cus_test',amountCents:1000,currency:'usd',eventId:'evt_test',liveMode:false}]);
});
