'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createContinuationRuntime}=require('../src/automation/engineeringTeam/continuationRuntime');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const issue=42,manifestDigest='b'.repeat(64);
const run={id:123,run_attempt:1,workflow_id:77,repository:{full_name:scope.repository},head_sha:scope.sha,status:'completed',conclusion:'success'};
function fixture({eligible=false}={}){
 const calls=[];
 const identities={manager:{id:'manager',permission:'queue.manage',...scope},worker:{id:'worker',permission:'queue.work',role:'devops',...scope}};
 const authenticate=async credential=>identities[credential]||null;
 const pool={connect:async()=>({async query(sql){
  if(sql==='BEGIN'||sql==='COMMIT'||sql.startsWith('SELECT pg_advisory'))return {rowCount:0,rows:[]};
  if(sql.includes('engineering_team_stops'))return {rowCount:1,rows:[{blocked:false}]};
  if(sql.includes('engineering_team_ci_events'))return {rowCount:1,rows:[{run_id:123}]};
  throw Error('Unexpected SQL '+sql);
 },release(){}})};
 const queue={async claim(){calls.push('claim');return null;},async finish(){calls.push('finish');return 'failed';},
  async enqueue(){calls.push('enqueue');},async inspectWorkflowStep(){calls.push('inspect');return null;},
  async stop(){calls.push('stop');},async quarantine(){calls.push('quarantine');},async expire(){calls.push('expire');},async cancel(){calls.push('cancel');}};
 const policy={async evaluate(){calls.push('policy');return {scope,issueNumber:issue,manifestDigest,policyVersion:'v1',decision:eligible?'queued:none':'blocked:not_allowlisted',eligibleForPreparation:eligible,executionAuthorized:false,evidenceSha256:'c'.repeat(64)}}};
 const runtime=createContinuationRuntime({pool,scope,workflowId:77,authenticate,managerCredential:'manager',workerCredential:'worker',role:'devops',readRun:async()=>run,queue,policy,issue,manifestDigest,manager:{createTask:()=>({id:'task'}),propose:async()=>assert.fail('proposal must not run')},loadTask:async()=>assert.fail('task load must not run')});
 return {runtime,calls};
}
test('continuation runtime refuses construction without current queue policy',()=>{
 const f=fixture();
 assert.ok(f.runtime);
 assert.throws(()=>createContinuationRuntime({scope,workflowId:77,authenticate:async()=>null,managerCredential:'manager',workerCredential:'worker',role:'devops',readRun:async()=>run,queue:{},manager:{},loadTask:async()=>{}}),/Invalid policy-bound queue/);
});
test('successful CI event cannot bypass a now-blocked issue policy to claim a task',async()=>{
 const f=fixture();
 const result=await f.runtime.onCompletion({runId:123,attempt:1});
 assert.equal(result.state,'drained');
 assert.equal(result.result.reason,'failed');
 assert.deepEqual(f.calls,['policy','finish']);
 assert.equal(f.calls.includes('claim'),false);
});
