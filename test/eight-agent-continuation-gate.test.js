'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createContinuationGate}=require('../src/automation/engineeringTeam/continuationGate');
const scope={product:'aca',repository:'owner/repo',sha:'a'.repeat(40)};
const event={runId:123,attempt:1,role:'devops',credential:'fixture'};
const valid={id:123,run_attempt:1,workflow_id:42,repository:{full_name:scope.repository},head_sha:scope.sha,status:'completed',conclusion:'success'};
test('verified successful CI drains once with pinned scope',async()=>{
 let admitted=false,calls=0;
 const gate=createContinuationGate({scope,workflowId:42,readRun:async()=>valid,admitEvent:async e=>{assert.equal(e.runId,123);if(admitted)return false;admitted=true;return true;},drain:{async run(req){calls++;assert.deepEqual(req.scope,scope);return {reason:'idle'};}}});
 assert.equal((await gate.onCompletion(event)).state,'drained');
 assert.equal((await gate.onCompletion(event)).state,'duplicate-or-denied');
 assert.equal(calls,1);
});
test('wrong SHA, repo, workflow, attempt, failure and pending CI denied',async()=>{
 for(const patch of [{head_sha:'b'.repeat(40)},{repository:{full_name:'other/repo'}},{workflow_id:43},{run_attempt:2},{conclusion:'failure'},{status:'in_progress'}]){
  const gate=createContinuationGate({scope,workflowId:42,readRun:async()=>({...valid,...patch}),admitEvent:async()=>assert.fail('admission called'),drain:{run:()=>assert.fail('drain called')}});
  assert.equal((await gate.onCompletion(event)).state,'denied');
 }
});
test('admission error fails closed',async()=>{
 const gate=createContinuationGate({scope,workflowId:42,readRun:async()=>valid,admitEvent:async()=>{throw Error('unavailable');},drain:{run:()=>assert.fail('drain called')}});
 await assert.rejects(gate.onCompletion(event),/unavailable/);
});
