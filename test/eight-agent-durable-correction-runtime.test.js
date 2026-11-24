'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {createDurableCorrectionRuntime}=require('../src/automation/engineeringTeam/durableCorrectionRuntime');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)},role='backend-developer',taskId='123e4567-e89b-12d3-a456-426614174000';
const files=[{path:'src/fixture.js',role,text:'old'}];
const edits=[{path:files[0].path,beforeSha256:digest('old'),replacement:'fixed'}];
function setup(admitted){
 let queries=0,runner=0;
 const pool={async connect(){return {async query(sql){queries++;if(sql==='BEGIN'||sql==='COMMIT'||sql.startsWith('SELECT pg_advisory'))return {rowCount:0,rows:[]};return {rowCount:admitted?1:0,rows:[]};},release(){}};}};
 const runtime=createDurableCorrectionRuntime({pool,scope,authenticate:async c=>c==='manager'?{id:'manager',permission:'queue.manage',...scope}:null,managerCredential:'manager',files,role,requiredChecks:['syntax'],authorize:async()=>true,proposeEdits:async()=>edits,runIsolated:async ({plan,checks,profile})=>{runner++;return {evidenceSha256:plan.evidenceSha256,profile,checks:checks.map(name=>({name,status:'passed'}))};},reviewCandidate:async ({candidate})=>({role:'security-reviewer',disposition:'recommend-review',evidenceSha256:candidate.evidenceSha256})});
 return {runtime,get:()=>({queries,runner})};
}
test('durable admission precedes runner and reviewer, candidate remains non-executable',async()=>{
 const x=setup(true);const result=await x.runtime.run({taskId,edits});
 assert.equal(result.state,'candidate-passed');assert.equal(result.executionAuthorized,false);assert.equal(result.releaseApproved,false);assert.equal(result.review.role,'security-reviewer');assert.ok(x.get().queries>=4);assert.equal(x.get().runner,1);
});
test('failed durable admission prevents isolated runner',async()=>{
 const x=setup(false);assert.equal((await x.runtime.run({taskId,edits})).state,'denied');assert.equal(x.get().runner,0);
});
