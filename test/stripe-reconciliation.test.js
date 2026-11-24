'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStripeReconciliation}=require('../src/security/stripeReconciliation');
test('reconciliation denies unauthorized actors before querying receipts',async()=>{
 let reads=0;
 const trustedActor={};
 const service=createStripeReconciliation({receipts:{listUnresolved:async limit=>{reads++;return [{limit}];}},authorize:async(actor,permission)=>actor===trustedActor&&permission==='stripe.receipts.read'});
 await assert.rejects(service.list({admin:true}),/Forbidden/);
 await assert.rejects(service.list(null),/Forbidden/);
 assert.equal(reads,0);
 assert.deepEqual(await service.list(trustedActor,10),[{limit:10}]);
 assert.equal(reads,1);
 assert.deepEqual(Object.keys(service),['list']);
});

test('reconciliation rejects invalid limits before store access and fails closed on authorization error',async()=>{
 let reads=0;
 const receipts={listUnresolved:async()=>{reads++;return [];}};
 const service=createStripeReconciliation({receipts,authorize:async()=>true});
 for(const limit of [0,501,1.5,'10',null]) await assert.rejects(service.list({},limit),TypeError);
 const denied=createStripeReconciliation({receipts,authorize:async()=>{throw Error('authorization unavailable');}});
 await assert.rejects(denied.list({},10),/authorization unavailable/);
 assert.equal(reads,0);
 assert.deepEqual(await service.list({},500),[]);
 assert.equal(reads,1);
});
