'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPolicyBoundQueue}=require('../src/automation/engineeringTeam/policyBoundQueue');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const issue=42,manifestDigest='b'.repeat(64);
function fixture(){
 let eligible=true,calls=[];
 const policy={async evaluate(){return {scope,issueNumber:issue,manifestDigest,policyVersion:'v1',eligibleForPreparation:eligible,executionAuthorized:false,evidenceSha256:'c'.repeat(64)}}};
 const queue=Object.fromEntries(['enqueue','inspectWorkflowStep','claim','finish','stop','quarantine','expire','cancel'].map(name=>[name,async input=>{calls.push(name);return name==='inspectWorkflowStep'?null:name==='claim'?null:true}]));
 return {bound:createPolicyBoundQueue({queue,policy,scope,issue,manifestDigest}),calls,block(){eligible=false}};
}
test('policy is re-evaluated at every new admission, inspection and claim',async()=>{
 const f=fixture();
 await f.bound.enqueue({scope,role:'orchestrator'});
 await f.bound.inspectWorkflowStep({scope,workflowId:'w',workflowStep:0,credential:'manager'});
 await f.bound.claim({scope,role:'orchestrator',credential:'worker'});
 assert.deepEqual(f.calls,['enqueue','inspectWorkflowStep','claim']);
 f.block();
 await assert.rejects(f.bound.enqueue({scope,role:'orchestrator'}),/Queue policy denied/);
 await assert.rejects(f.bound.inspectWorkflowStep({scope,workflowId:'w',workflowStep:0,credential:'manager'}),/Queue policy denied/);
 assert.equal(await f.bound.claim({scope,role:'orchestrator',credential:'worker'}),null);
 assert.deepEqual(f.calls,['enqueue','inspectWorkflowStep','claim']);
});
test('completion remains available after policy closes to persist an in-flight receipt',async()=>{
 const f=fixture();f.block();
 assert.equal(await f.bound.finish({scope,role:'orchestrator',taskId:'t',leaseId:'l',outcome:'succeeded'}),true);
 assert.deepEqual(f.calls,['finish']);
});
test('policy evidence must match exact issue, manifest, repository and revision',async()=>{
 for(const patch of [
  {issueNumber:43},{manifestDigest:'d'.repeat(64)},{scope:{...scope,sha:'e'.repeat(40)}},
  {executionAuthorized:true},{eligibleForPreparation:false},{evidenceSha256:'bad'}
 ]){
  const f=fixture();
  const policy={evaluate:async()=>({scope,issueNumber:issue,manifestDigest,eligibleForPreparation:true,executionAuthorized:false,evidenceSha256:'c'.repeat(64),...patch})};
  const bound=createPolicyBoundQueue({queue:Object.fromEntries(['enqueue','inspectWorkflowStep','claim','finish','stop','quarantine','expire','cancel'].map(name=>[name,async()=>true])),policy,scope,issue,manifestDigest});
  await assert.rejects(bound.enqueue({}),/Queue policy denied/);
 }
});

test('policy facade rejects cross-product input scope before policy evaluation or queue access',async()=>{
 const f=fixture();
 await assert.rejects(f.bound.enqueue({scope:{...scope,product:'other-product'},role:'orchestrator'}),/Queue scope denied/);
 assert.deepEqual(f.calls,[]);
});

test('policy facade snapshots configured and caller scope before asynchronous policy evaluation',async()=>{
 const mutableScope={...scope};
 let releasePolicy;
 const policyPending=new Promise(resolve=>{releasePolicy=resolve;});
 const received=[];
 const queue={enqueue:async input=>{received.push(input);return true;},inspectWorkflowStep:async()=>null,claim:async()=>null,finish:async()=>true,stop:async()=>true,quarantine:async()=>true,expire:async()=>0,cancel:async()=>true};
 const policy={evaluate:async()=>{await policyPending;return {scope:{...scope},issueNumber:issue,manifestDigest,policyVersion:'v1',eligibleForPreparation:true,executionAuthorized:false,evidenceSha256:'c'.repeat(64)};}};
 const bound=createPolicyBoundQueue({queue,policy,scope:mutableScope,issue,manifestDigest});
 const input={scope:{...mutableScope},role:'orchestrator'};
 const pending=bound.enqueue(input);
 input.scope.product='other-product';
 mutableScope.product='other-product';
 releasePolicy();
 await pending;
 assert.equal(received.length,1);
 assert.deepEqual(received[0].scope,scope);
 assert.notEqual(received[0].scope,input.scope);
});
