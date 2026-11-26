"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {verifyAndBindInvoice}=require("../src/brain/verifiedStripeBinding");
const input={invoiceId:1,tenantId:2,stripeInvoiceId:"in_fixture",amountCents:60,livemode:true};
const invoice={id:"in_fixture",object:"invoice",livemode:true,currency:"usd",status:"open",amount_due:60,amount_remaining:60,amount_paid:0,customer:"cus_fixture"};
test("verified provider invoice uses canonical binding",async()=>{
 let args;
 const result=await verifyAndBindInvoice({query:async(sql,a)=>{args=a;return {rowCount:1,rows:[{invoice_id:1}]};}},{invoices:{retrieve:async()=>invoice}},input);
 assert.equal(result.invoice_id,1);assert.deepEqual(args,["in_fixture","cus_fixture",1,2,60,true]);
});
test("provider mismatches never reach database",async()=>{
 for(const change of [{id:"in_other"},{livemode:false},{currency:"cad"},{amount_due:61},{amount_remaining:30},{amount_paid:30},{status:"paid"},{customer:null}]){
 await assert.rejects(verifyAndBindInvoice({query:async()=>assert.fail("unexpected write")},{invoices:{retrieve:async()=>({...invoice,...change})}},input),/PROVIDER_INVOICE_MISMATCH/);
 }
});
