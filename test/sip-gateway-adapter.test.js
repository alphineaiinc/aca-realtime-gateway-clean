"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {createSipGatewayAdapter}=require("../src/voice/sipGatewayAdapter");
test("SIP signaling proof cannot substitute for media proof",async()=>{
 const identity={carrier:"sip",accountId:"fixture",callId:"call",calledNumber:"+2348000000000"};
 let grant;
 const gateway=createSipGatewayAdapter({
 verifySignaling:async x=>x==="signal"?identity:null,
 verifyMedia:async x=>x==="media"?identity:null,
 lookupBinding:async()=>({active:true,tenantId:1}),
 store:{reserve:async x=>{if(grant)return false;grant=x;return true;},consume:async x=>{if(!grant||grant.used||grant.tokenHash!==x.tokenHash||grant.key!==x.key)return false;grant.used=true;return true;}}
 });
 assert.equal(await gateway.issue("media"),null);
 const token=await gateway.issue("signal");assert.ok(token);
 assert.equal(await gateway.consume("signal",token),null);
 assert.equal((await gateway.consume("media",token)).tenantId,1);
 assert.equal(await gateway.consume("media",token),null);
});
