"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {carrierCallIdentity}=require("../src/voice/carrierCallIdentity");
test("carrier identity separates provider account call and Nigerian destination",()=>{
 const base={carrier:"sip",accountId:"account-a",callId:"call-a",calledNumber:"+2348000000000"};
 const id=carrierCallIdentity(base);
 assert.match(id,/^[a-f0-9]{64}$/);
 assert.equal(id,carrierCallIdentity({...base}));
 for(const change of [{carrier:"twilio"},{accountId:"account-b"},{callId:"call-b"},{calledNumber:"+2348000000001"}])
 assert.notEqual(id,carrierCallIdentity({...base,...change}));
 for(const change of [{carrier:""},{accountId:"a\n"},{callId:null},{calledNumber:"08000000000"}])
 assert.throws(()=>carrierCallIdentity({...base,...change}),{message:"INVALID_CARRIER_CALL_IDENTITY"});
});
