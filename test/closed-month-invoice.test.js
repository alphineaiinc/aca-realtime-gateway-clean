"use strict";
const {test}=require("node:test");const assert=require("node:assert/strict");const {invoiceClosedMonth}=require("../src/brain/closedMonthInvoice");
const input={tenantId:2,year:2020,month:1,minuteRateCents:5,tokenRateMicros:500};
test("closed month invoice uses verified usage and atomic period claim",async()=>{let call;const result=await invoiceClosedMonth({query:async(sql,args)=>{call={sql,args};return {rows:[{id:1}]};}},input);assert.equal(result.id,1);assert.match(call.sql,/ACA_VERIFIED_USAGE/);assert.match(call.sql,/ON CONFLICT DO NOTHING/);assert.equal(call.args[0],2);assert.equal(call.args[1].toISOString(),"2020-01-01T00:00:00.000Z");});
test("duplicate or empty period returns no invoice",async()=>assert.equal(await invoiceClosedMonth({query:async()=>({rows:[]})},input),null));
test("open period and negative price rejected",async()=>{await assert.rejects(invoiceClosedMonth({}, {...input,year:9999}),/PERIOD_NOT_CLOSED/);await assert.rejects(invoiceClosedMonth({}, {...input,minuteRateCents:-1}),/INVALID_INVOICE_INPUT/);});
