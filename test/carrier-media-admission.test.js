"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createCarrierMediaAdmission}=require("../src/voice/carrierMediaAdmission");
test("verified account and number binding, replay and revocation",async()=>{
 const call={carrier:"sip",accountId:"a",callId:"c",calledNumber:"+2348000000000"};
 let active=true;const rows=new Map();
 const service=createCarrierMediaAdmission({
 authenticate:async input=>input===call?call:null,
 lookupBinding:async x=>x.accountId==="a"&&x.calledNumber===call.calledNumber?{active,tenantId:7}:null,
 store:{reserve:async x=>{if(rows.has(x.key))return false;rows.set(x.key,x);return true;},
 consume:async x=>{const row=rows.get(x.key);if(!row||row.used||row.tokenHash!==x.tokenHash||row.tenantId!==x.tenantId)return false;row.used=true;return true;}}
 });
 assert.equal(await service.issue({...call}),null);
 const token=await service.issue(call);assert.ok(token);
 assert.equal(await service.issue(call),null);
 assert.equal(await service.consume({...call},token),null);
 active=false;assert.equal(await service.consume(call,token),null);active=true;
 const claims=await Promise.all([service.consume(call,token),service.consume(call,token)]);
 assert.equal(claims.filter(Boolean).length,1);
 assert.equal(await service.consume(call,token),null);
});
