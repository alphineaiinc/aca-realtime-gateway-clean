'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPatchPlanner,digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {preparePublicationRequest}=require('../src/automation/engineeringTeam/publicationRequest');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const plan=createPatchPlanner({scope,files:[{path:'src/example.js',role:'backend-developer',text:'module.exports=1;'}]}).plan({role:'backend-developer',edits:[{path:'src/example.js',beforeSha256:digest('module.exports=1;'),replacement:'module.exports=2;'}]});
const verification={evidenceSha256:plan.evidenceSha256,provenance:'unverified-runner-report',checks:[{name:'syntax',status:'passed'}]};
const review={evidenceSha256:plan.evidenceSha256,role:'security-reviewer',disposition:'recommend-review'};
test('publication request binds all evidence and never grants write permission',()=>{
 const request=preparePublicationRequest({plan,verification,review});
 assert.equal(request.mode,'draft-only');assert.equal(request.executionAuthorized,false);assert.equal(request.requiresIndependentAcceptance,true);
 assert.match(request.evidenceSha256,/^[a-f0-9]{64}$/);
});
test('missing or stale evidence and developer self-review are denied',()=>{
 for(const input of [{review:undefined},{review:{...review,role:'backend-developer'}},{verification:{...verification,evidenceSha256:'wrong'}},{review:{...review,disposition:'approved'}}])assert.throws(()=>preparePublicationRequest({plan,verification,review,...input}));
});
