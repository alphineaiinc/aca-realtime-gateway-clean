'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {createChangePreparation}=require('../src/automation/engineeringTeam/changePreparation');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const files=[{path:'src/example.js',role:'backend-developer',text:'module.exports=1;'}];
function fixture({deny,failTest=false,badReview=false}={}){
 const calls=[];
 const preparation=createChangePreparation({scope,files,requiredChecks:['fixture'],authorize:async x=>x.action!==deny,
 generate:async()=>{calls.push('generate');return JSON.stringify({edits:[{path:files[0].path,beforeSha256:digest(files[0].text),replacement:'module.exports=2;'}]});},
 runIsolated:async x=>{calls.push('test');return {evidenceSha256:x.plan.evidenceSha256,profile:x.profile,checks:[{name:'fixture',status:failTest?'failed':'passed'}]};},
 reviewPatch:async x=>{calls.push('review');return {role:badReview?'backend-developer':'security-reviewer',disposition:'recommend-review',evidenceSha256:x.plan.evidenceSha256};}});
 return {preparation,calls};
}
const input={role:'backend-developer',subject:'Disposable fixture'};
test('prepares a bound patch, test, reviewer, branch and publication evidence without writes',async()=>{
 const f=fixture();const result=await f.preparation.prepare(input);
 assert.deepEqual(f.calls,['generate','test','review']);
 assert.equal(result.plan.evidenceSha256,result.request.patchDigest);
 assert.equal(result.branch.patchDigest,result.request.patchDigest);
 assert.equal(result.executionAuthorized,false);assert.equal(result.releaseApproved,false);
 await assert.rejects(f.preparation.prepare(input));
});
test('test failure or review denial prevents publication preparation',async()=>{
 for(const options of [{failTest:true},{deny:'review.simulate'}]){
  const f=fixture(options);await assert.rejects(f.preparation.prepare(input));assert.deepEqual(f.calls,['generate','test']);
 }
 const g=fixture({badReview:true});await assert.rejects(g.preparation.prepare(input));assert.deepEqual(g.calls,['generate','test','review']);
});
test('initial authorization denial prevents model call',async()=>{
 const f=fixture({deny:'patch.simulate'});await assert.rejects(f.preparation.prepare(input));assert.deepEqual(f.calls,[]);
});
