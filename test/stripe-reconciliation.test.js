"use strict";
const {test}=require("node:test");const assert=require("node:assert/strict");
const {reconcileOne}=require("../src/brain/stripeReconciliation");
function fixture(invoice,match=true,livemode=true){const calls=[];const client={release(){},async query(sql,args){calls.push({sql,args});if(sql.startsWith("SELECT event_id"))return {rows:[{event_id:"evt_test",payload:{livemode,data:{object:invoice}}}]};if(sql.startsWith("UPDATE public.billing_invoices"))return {rowCount:match?1:0,rows:match?[{id:2,tenant_id:3}]:[]};return {rows:[],rowCount:1};}};return {pool:{connect:async()=>client},calls};}
const valid={object:"invoice",status:"paid",paid:true,currency:"usd",amount_paid:1200,amount_due:1200,amount_remaining:0,paid_out_of_band:false,id:"in_test",customer:"cus_test"};
test("verified bound invoice settles and queues notification atomically",async()=>{const f=fixture(valid);assert.equal(await reconcileOne(f.pool),"settled");assert.deepEqual(f.calls.find(x=>x.sql.startsWith("UPDATE public.billing_invoices")).args,["in_test","cus_test",1200,true]);assert.ok(f.calls.some(x=>x.sql.startsWith("INSERT INTO public.aca_billing_notification_outbox")));assert.equal(f.calls.at(-1).sql,"COMMIT");});
test("unmatched invoice does not queue notification",async()=>{const f=fixture(valid,false);assert.equal(await reconcileOne(f.pool),"unmatched");assert.ok(!f.calls.some(x=>x.sql.startsWith("INSERT INTO public.aca_billing_notification_outbox")));});
test("wrong currency or unpaid invoice cannot settle",async()=>{for(const invoice of [{...valid,currency:"cad"},{...valid,paid:false}]){const f=fixture(invoice);assert.equal(await reconcileOne(f.pool),"unmatched");assert.ok(!f.calls.some(x=>x.sql.startsWith("UPDATE public.billing_invoices")));}});

test("test mode cannot settle actual invoices",async()=>{const f=fixture(valid,true,false);assert.equal(await reconcileOne(f.pool),"unmatched");assert.ok(!f.calls.some(x=>x.sql.startsWith("UPDATE public.billing_invoices")));});

test("partial and out-of-band payments cannot settle",async()=>{for(const invoice of [{...valid,amount_remaining:1},{...valid,amount_due:1300},{...valid,paid_out_of_band:true}]){const f=fixture(invoice);assert.equal(await reconcileOne(f.pool),"unmatched");assert.ok(!f.calls.some(x=>x.sql.startsWith("UPDATE public.billing_invoices")));}});
