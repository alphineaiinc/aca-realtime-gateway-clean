"use strict";
const {test}=require("node:test");const assert=require("node:assert/strict");const {recordUsage,summarizeUsage}=require("../src/analytics/billableUsage");
const usage={tenantId:2,eventId:"CA_test",kind:"voice_seconds",quantity:30};
test("metering atomically claims event and writes analytics",async()=>{let call;assert.deepEqual(await recordUsage({query:async(sql,args)=>{call={sql,args};return {rowCount:1};}},usage),{stored:true});assert.match(call.sql,/WITH claimed AS/);assert.match(call.sql,/ON CONFLICT DO NOTHING/);assert.deepEqual(call.args,[2,"CA_test","voice_seconds",30]);});
test("duplicate usage is not billed again",async()=>assert.deepEqual(await recordUsage({query:async()=>({rowCount:0})},usage),{stored:false}));
test("invalid quantity rejected",async()=>assert.rejects(recordUsage({}, {...usage,quantity:-1}),/INVALID_USAGE/));
test("summary scopes verified usage to tenant and period",async()=>{let call;const start=new Date("2026-10-01"),end=new Date("2026-11-01");await summarizeUsage({query:async(sql,args)=>{call={sql,args};return {rows:[{}]};}},{tenantId:2,start,end});assert.match(call.sql,/tenant_id=\$1 AND event_type='ACA_VERIFIED_USAGE'/);assert.deepEqual(call.args,[2,start,end]);});
