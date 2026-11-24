const test=require('node:test');
const assert=require('node:assert/strict');
const {createVerifiedUsageStore,totalCents}=require('../src/security/verifiedUsage');
test('integer pricing rounds once without floating point drift',()=>{
 assert.equal(totalCents([{quantity:3,microUsdPerUnit:1667}]),1n);
 assert.equal(totalCents([{quantity:1,microUsdPerUnit:4999}]),0n);
 assert.throws(()=>totalCents([{quantity:-1,microUsdPerUnit:1}]));
});
test('usage rejects conflicting replay and invalid evidence',async()=>{
 let calls=0,match=true;
 const record=createVerifiedUsageStore({query:async()=>({rowCount:++calls===1||calls%2===1&&match?1:0})});
 const f={source:'twilio',sourceId:'CAfixture',unit:'call_second',tenantId:1,quantity:60,priceVersion:'v1',occurredAt:'2026-01-01T00:00:00Z'};
 await assert.rejects(record({...f,quantity:-1}));assert.equal(calls,0);
 assert.equal(await record(f),'recorded');assert.equal(await record(f),'duplicate');
 match=false;await assert.rejects(record({...f,tenantId:2}));
});
