'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createWorkflowLedger}=require('../src/automation/engineeringTeam/workflowLedger');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const identity={...scope,id:'manager',permission:'queue.manage'};
const methods={advance:{id:'fixture',step:0,taskId:'task'},beginPreparation:{id:'fixture'},completePreparation:{id:'fixture',result:{fixture:true}}};
for(const [method,input] of Object.entries(methods)){
 test('ledger '+method+' denies revoked or changed identity after lock',async()=>{
  for(const next of [null,{...identity,id:'other'},{...identity,permission:'queue.work'},{...identity,product:'other'},{...identity,repository:'fixture/other'},{...identity,sha:'b'.repeat(40)}]){
   let checks=0,locked=false,released=false;const queries=[];
   const client={async query(sql){queries.push(sql);if(sql.includes('pg_advisory_xact_lock'))locked=true;return {rowCount:0,rows:[]};},release(){released=true;}};
   const pool={query:async()=>assert.fail('unexpected pool query'),connect:async()=>client};
   const ledger=createWorkflowLedger({pool,scope,authenticate:async()=>{checks++;return locked?next:identity;}});
   await assert.rejects(ledger[method]({credential:'fixture',...input}),/Workflow identity denied/);
   assert.equal(checks,2);assert.equal(queries.length,3);assert.equal(queries[0],'BEGIN');assert.equal(queries[2],'ROLLBACK');assert.ok(released);
  }
 });
}
