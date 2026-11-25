'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPatchPlanner,digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {createIsolatedTestAdapter}=require('../src/automation/engineeringTeam/isolatedTestAdapter');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const original='module.exports=1;';
const plan=createPatchPlanner({scope,files:[{role:'backend-developer',path:'src/example.js',text:original}]}).plan({role:'backend-developer',edits:[{path:'src/example.js',beforeSha256:digest(original),replacement:'module.exports=2;'}]});
const report={evidenceSha256:plan.evidenceSha256,profile:'disposable-no-network-no-secrets',checks:[{name:'unit',status:'passed'},{name:'syntax',status:'passed'}]};
const make=(runIsolated,authorize=async()=>true)=>createIsolatedTestAdapter({runIsolated,authorize,requiredChecks:['unit','syntax']});
test('isolated runner contract binds required checks to exact patch evidence',async()=>{
 const result=await make(async request=>{assert.equal(request.timeoutSeconds,30);assert.equal(request.profile,report.profile);return report;}).verify(plan);
 assert.equal(result.provenance,'unverified-runner-report');assert.equal(result.executionAuthorized,false);
});
test('rejects stale, incomplete, failed or duplicate runner evidence',async()=>{
 for(const r of [{...report,evidenceSha256:'bad'},{...report,checks:[]},{...report,checks:[{name:'unit',status:'passed'},{name:'syntax',status:'failed'}]},{...report,checks:[report.checks[0],report.checks[0]]}])await assert.rejects(make(async()=>r).verify(plan));
});
test('denied authorization or changed patch never invokes runner',async()=>{
 await assert.rejects(make(async()=>assert.fail('runner invoked'),async()=>false).verify(plan));
 await assert.rejects(make(async()=>assert.fail('runner invoked')).verify({...plan,evidenceSha256:'bad'}));
});
