const test=require('node:test');
const assert=require('node:assert/strict');
const {createTrustedInvoiceMapping}=require('../src/security/trustedInvoiceMapping');
test('mapping checks provider facts and tenant ledger before insertion',async()=>{
 const input={tenantId:7,invoiceId:5,stripeInvoiceId:'in_a',stripeCustomerId:'cus_a'};
 const valid={id:'in_a',customer:'cus_a',livemode:true,currency:'usd',status:'open',amount_due:1000};
 let v=valid;const calls=[];
 const run=createTrustedInvoiceMapping({stripe:{invoices:{retrieve:async()=>v}},pool:{query:async(sql,args)=>{calls.push(args);return {rowCount:1};}}});
 for(const patch of [{customer:'cus_b'},{livemode:false},{currency:'cad'},{status:'paid'},{amount_due:0}]){
  v={...valid,...patch};await assert.rejects(run(input));
 }
 assert.equal(calls.length,0);v=valid;
 assert.equal(await run(input),'created');assert.deepEqual(calls,[['in_a','cus_a',5,7,1000]]);
});
