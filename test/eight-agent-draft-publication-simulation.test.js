'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {createDraftPublicationSimulation}=require('../src/automation/engineeringTeam/draftPublicationSimulation');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const payload={scope,operation:'github.write',mode:'draft-only',patchDigest:'b'.repeat(64),testDigest:'c'.repeat(64),reviewDigest:'d'.repeat(64)};
const request={...payload,evidenceSha256:digest(JSON.stringify(payload)),executionAuthorized:false,requiresIndependentAcceptance:true};
function make(overrides={}){
 return createDraftPublicationSimulation({scope,authorize:async()=>true,transport:{readBase:async()=>scope.sha,createDraft:async r=>({draft:true,repository:scope.repository,number:1,evidenceSha256:r.evidenceSha256})},...overrides});
}
test('draft-only simulation rejects duplicate evidence',async()=>{
 const p=make();assert.equal((await p.publish(request)).provenance,'simulation-only');await assert.rejects(p.publish(request),/Duplicate/);
});
test('stale base, unauthorized request and modified evidence are denied',async()=>{
 await assert.rejects(make({authorize:async()=>false}).publish(request),/Authorization/);
 await assert.rejects(make({transport:{readBase:async()=> 'e'.repeat(40),createDraft:async()=>assert.fail('write invoked')}}).publish(request),/Stale/);
 await assert.rejects(make().publish({...request,patchDigest:'f'.repeat(64)}),/Evidence/);
});
test('unknown outcome freezes further publication attempts',async()=>{
 let calls=0;const p=make({transport:{readBase:async()=>scope.sha,createDraft:async()=>{calls++;throw Error('timeout');}}});
 await assert.rejects(p.publish(request),/Reconciliation/);await assert.rejects(p.publish(request),/Reconciliation/);assert.equal(calls,1);
});
