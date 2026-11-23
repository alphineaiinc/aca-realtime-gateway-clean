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
