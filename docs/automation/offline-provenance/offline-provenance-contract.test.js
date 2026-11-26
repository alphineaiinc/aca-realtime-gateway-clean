'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createOfflineProvenanceContract}=require('./offline-provenance-contract');
const expected={repository:'fixture/repo',sourceSha:'a'.repeat(40),workflow:'fixture/repo/.github/workflows/release.yml',workflowSha:'b'.repeat(40),digest:'sha256:'+'c'.repeat(64),issuer:'fixture-issuer',predicate:'fixture-build-provenance',platform:'linux/amd64',rootDigest:'sha256:'+'d'.repeat(64)};
const fixture={...expected,mode:'synthetic-fixture',signatureStatus:'fixture-valid',transparencyStatus:'fixture-valid',manifestType:'platform-manifest'};
const verify=(records)=>createOfflineProvenanceContract(expected).assessFixture(async()=>records);
function denied(r){assert.equal(r.status,'denied');assert.equal(r.executionAuthorized,false);assert.equal(r.releaseApproved,false);assert.equal(r.cryptographicallyVerified,false);}
test('matching synthetic provenance never authorizes execution or release',async()=>{
 for(const review of [undefined,{status:'expired'},{status:'revoked'},{status:'approved'}]){
  const r=await verify([{...fixture,review,executionAuthorized:true,releaseApproved:true}]);
  assert.equal(r.status,'fixture-provenance-match');assert.equal(r.executionAuthorized,false);assert.equal(r.releaseApproved,false);assert.equal(r.cryptographicallyVerified,false);
 }
});
test('every pinned field mismatch denies',async()=>{
 for(const [k,v] of Object.entries(expected)){
  const replacement=k.endsWith('Sha')?'e'.repeat(40):v.startsWith('sha256:')?'sha256:'+'e'.repeat(64):'different';
  denied(await verify([{...fixture,[k]:replacement}]));
 }
});
test('missing ambiguous contradictory and malformed evidence denies',async()=>{
 for(const records of [null,[],[fixture,fixture],[fixture,{...fixture,issuer:'other'}],[null],[{...fixture,digest:undefined}],[{...fixture,signatureStatus:'unknown'}],[{...fixture,transparencyStatus:'unknown'}],[{...fixture,manifestType:'index'}],[{...fixture,mode:'real'}]])denied(await verify(records));
 const c=createOfflineProvenanceContract(expected);
 denied(await c.assessFixture(async()=>{throw Error('unavailable');}));
 denied(await c.assessFixture(null));
});
test('expectation snapshot resists mutation during asynchronous fixture read',async()=>{
 const mutable={...expected},c=createOfflineProvenanceContract(mutable);
 denied(await c.assessFixture(async()=>{mutable.repository='other/repo';return [{...fixture,repository:mutable.repository}];}));
 assert.equal((await c.assessFixture(async()=>[fixture])).status,'fixture-provenance-match');
});
test('invalid expectation pins reject construction',()=>{
 for(const bad of [{...expected,digest:'latest'},{...expected,sourceSha:'main'},{...expected,rootDigest:''}])assert.throws(()=>createOfflineProvenanceContract(bad));
});

test('unresponsive asynchronous fixture denies at deadline and signals cancellation',async()=>{
 const c=createOfflineProvenanceContract(expected,{timeoutMs:10});
 let signal;
 const r=await c.assessFixture(async s=>{signal=s;return new Promise(()=>{});});
 denied(r);assert.equal(signal.aborted,true);
});
test('late fixture success cannot reverse deadline denial',async()=>{
 const c=createOfflineProvenanceContract(expected,{timeoutMs:5});
 let resolve;
 const r=await c.assessFixture(()=>new Promise(r=>{resolve=r;}));
 denied(r);resolve([fixture]);await Promise.resolve();denied(r);
});
test('invalid fixture deadlines reject construction',()=>{
 for(const timeoutMs of [0,-1,5001,NaN,Infinity,1.5,'10'])assert.throws(()=>createOfflineProvenanceContract(expected,{timeoutMs}),/deadline/);
});
