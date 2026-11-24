'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createApprovalPolicy}=require('../src/automation/engineeringTeam/approvalPolicy');
const {createQueueWorker}=require('../src/automation/engineeringTeam/queueWorker');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
test('owner decisions are scoped, expiring, single decision and never activate offline execution',async()=>{
 let now=1000;
 const policy=createApprovalPolicy({clock:()=>now,ttlMs:1000,authenticate:async c=>c==='owner'?{id:'owner',product:scope.product,repository:scope.repository,permission:'owner.approval'}:c==='agent'?{id:'worker',product:scope.product,repository:scope.repository,permission:'owner.approval',role:'devops'}:null});
 const req=policy.request({scope,operation:'provider.activate',evidence:'b'.repeat(64)});
 const decision={id:req.id,binding:req.binding,decision:'approved'};
 await assert.rejects(policy.recordDecision({...decision,credential:'agent'}));
 await assert.rejects(policy.recordDecision({...decision,credential:'owner',binding:'wrong'}));
 const result=await policy.recordDecision({...decision,credential:'owner'});
 assert.equal(result.state,'approved');assert.equal(result.executionAuthorized,false);
 await assert.rejects(policy.recordDecision({...decision,credential:'owner'}));
 assert.equal(policy.executionAllowed(),false);
 const expired=policy.request({scope,operation:'merge',evidence:'c'.repeat(64)});now+=1000;
 await assert.rejects(policy.recordDecision({id:expired.id,binding:expired.binding,credential:'owner',decision:'approved'}));
});
function fixture({badScope=false,denyFinish=false}={}){
 const calls=[];
 const queue={async claim(){return {id:'fixture-task',lease_id:'fixture-lease'};},async finish(x){calls.push(x);if(denyFinish)throw Error('Lease denied');return x.outcome==='failed'?'queued':'succeeded';}};
 const manager={createTask(input){return {...input,id:'local-task'};},async propose(input){return {...input,approval:false};}};
 const worker=createQueueWorker({queue,manager,loadTask:async()=>({id:'fixture-task',...scope,repository:badScope?'other/repo':scope.repository,subject:'fixture'})});
 return {worker,calls};
}
test('queue worker returns proposal only after successful lease completion',async()=>{
 const {worker,calls}=fixture();
 const result=await worker.runOnce({scope,role:'backend-developer',credential:'fixture'});
 assert.equal(result.state,'succeeded');assert.equal(result.releaseApproved,false);
 assert.equal(calls[0].leaseId,'fixture-lease');
});
test('queue worker rejects cross-scope payload and does not return proposal',async()=>{
 const {worker,calls}=fixture({badScope:true});
 const result=await worker.runOnce({scope,role:'backend-developer',credential:'fixture'});
 assert.equal(result.state,'queued');assert.equal(result.proposal,undefined);assert.equal(calls[0].outcome,'failed');
});
test('queue worker does not release proposal after lease loss',async()=>{
 const {worker}=fixture({denyFinish:true});
 await assert.rejects(worker.runOnce({scope,role:'backend-developer',credential:'fixture'}),/Lease denied/);
});
