'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPatchPlanner,digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {prepareBranch}=require('../src/automation/engineeringTeam/branchPreparation');
const {createChangeWorkflow}=require('../src/automation/engineeringTeam/changeWorkflow');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const files=[{path:'src/example.js',text:'module.exports=1;',role:'backend-developer'}];
const plan=createPatchPlanner({scope,files}).plan({role:'backend-developer',edits:[{path:files[0].path,beforeSha256:digest(files[0].text),replacement:'module.exports=2;'}]});
const spec=prepareBranch({scope,files,plan});
const verification={evidenceSha256:plan.evidenceSha256,provenance:'unverified-runner-report',checks:[{name:'fixture',status:'passed'}]};
const review={evidenceSha256:plan.evidenceSha256,role:'security-reviewer',disposition:'recommend-review'};
const input={files,plan,verification,review};
function fixture({allow=true,wrongBranch=false,fail=false}={}){
 const calls=[];
 const workflow=createChangeWorkflow({scope,authorize:async()=>allow,branchTransport:{create:async()=>{calls.push('branch');return {branch:spec.branch,binding:wrongBranch?'wrong':spec.binding,headSha:'b'.repeat(40),releaseApproved:false};}},draftTransport:{publish:async x=>{calls.push('draft');assert.equal(x.headBranch,spec.branch);assert.equal(x.headSha,'b'.repeat(40));assert.equal(x.request.patchDigest,plan.evidenceSha256);if(fail)throw Error('unknown outcome');return {number:42,draft:true,binding:'c'.repeat(64),releaseApproved:false};}}});
 return {workflow,calls};
}
test('branch and draft stages compose without release permission',async()=>{
 const f=fixture();const result=await f.workflow.run(input);
 assert.equal(result.number,42);assert.equal(result.releaseApproved,false);
 assert.deepEqual(f.calls,['branch','draft']);await assert.rejects(f.workflow.run(input));
});
test('missing evidence and denied workflow admission prevent all mutations',async()=>{
 const f=fixture();await assert.rejects(f.workflow.run({...input,review:undefined}));assert.deepEqual(f.calls,[]);
 const g=fixture({allow:false});await assert.rejects(g.workflow.run(input));assert.deepEqual(g.calls,[]);
});
test('wrong branch receipt or unknown publication outcome blocks progression and retry',async()=>{
 const f=fixture({wrongBranch:true});await assert.rejects(f.workflow.run(input),/reconciliation/);assert.deepEqual(f.calls,['branch']);
 const g=fixture({fail:true});await assert.rejects(g.workflow.run(input));await assert.rejects(g.workflow.run(input));assert.deepEqual(g.calls,['branch','draft']);
});
