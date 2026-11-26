"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createCarrierRegistry}=require("../src/voice/carrierRegistry");
const adapter=id=>({id,voiceWebhook(){return this.id},consumeStart(){return null},statusCallback(){}});
test("explicit carrier selection has no fallback",()=>{
 const registry=createCarrierRegistry([adapter("twilio"),adapter("sip-test")]);
 assert.equal(registry.get("twilio").voiceWebhook(),"twilio");
 assert.equal(registry.get("sip-test").voiceWebhook(),"sip-test");
 for(const id of ["unknown","__proto__",null,undefined])assert.equal(registry.get(id),null);
 assert.deepEqual(registry.list(),["twilio","sip-test"]);
 assert.ok(Object.isFrozen(registry.get("twilio")));
});
test("invalid and duplicate adapters rejected",()=>{
 for(const entries of [[adapter("twilio"),adapter("twilio")],[{id:"sip"}],[adapter("../sip")]])
 assert.throws(()=>createCarrierRegistry(entries),{message:"INVALID_CARRIER_ADAPTER"});
});
