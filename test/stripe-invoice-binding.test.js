"use strict";
const {test}=require("node:test");const assert=require("node:assert/strict");const {bindInvoice}=require("../src/brain/stripeInvoiceBinding");
const input={invoiceId:1,tenantId:2,stripeInvoiceId:"in_abc",stripeCustomerId:"cus_abc",amountCents:100,livemode:false};
test("binding requires matching local invoice tenant and amount",async()=>{let call;await bindInvoice({query:async(sql,args)=>{call={sql,args};return {rowCount:1,rows:[{invoice_id:1}]};}},input);assert.match(call.sql,/id=\$3 AND tenant_id=\$4 AND amount_usd\*100=\$5/);assert.deepEqual(call.args,["in_abc","cus_abc",1,2,100,false]);});
test("unmatched or duplicate binding rejected",async()=>{await assert.rejects(bindInvoice({query:async()=>({rowCount:0})},input),/BINDING_REJECTED/);});
test("invalid binding rejected before SQL",async()=>{await assert.rejects(bindInvoice({query:async()=>{throw Error("unexpected");}},{...input,amountCents:-1}),/INVALID_BINDING/);});
