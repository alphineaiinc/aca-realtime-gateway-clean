'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {createCorrectionRuntime}=require('../src/automation/engineeringTeam/correctionRuntime');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)},role='backend-developer';
const files=[{path:'src/fixture.js',role,text:'old'}];
const edits=replacement=>[{path:files[0].path,beforeSha256:digest('old'),replacement}];
const config={scope,role,files,requiredChecks:['syntax','node-tests','security'],authorize:async()=>true,admitCycle:async()=>true,reviewCandidate:async ({candidate})=>({role:'security-reviewer',disposition:'recommend-review',evidenceSha256:candidate.evidenceSha256})};
const report=({plan,checks,profile},failed)=>({evidenceSha256:plan.evidenceSha256,profile,checks:checks.map(name=>({name,status:name===failed?'failed':'passed'}))});
test('correction replans against pinned inventory and retests',async()=>{
 const runtime=createCorrectionRuntime({...config,proposeEdits:async()=>edits('fixed'),runIsolated:async input=>report(input,input.plan.changes[0].replacement==='fixed'?null:'node-tests')});
 const result=await runtime.run({edits:edits('broken')});
 assert.equal(result.state,'candidate-passed');assert.equal(result.candidate.changes[0].replacement,'fixed');assert.equal(result.candidateDigest,result.candidate.evidenceSha256);assert.equal(result.reviewRequired,false);assert.equal(result.review.role,'security-reviewer');assert.equal(result.executionAuthorized,false);
});
test('security check failure cannot trigger correction',async()=>{
 const runtime=createCorrectionRuntime({...config,proposeEdits:async()=>assert.fail('unexpected correction'),runIsolated:async input=>report(input,'security')});
 assert.equal((await runtime.run({edits:edits('broken')})).state,'blocked');
});
test('out of inventory correction never reaches isolated runner',async()=>{
 let runs=0;const runtime=createCorrectionRuntime({...config,proposeEdits:async()=>[{...edits('fixed')[0],path:'src/other.js'}],runIsolated:async input=>{runs++;return report(input,'syntax');}});
 assert.equal((await runtime.run({edits:edits('broken')})).state,'unknown');assert.equal(runs,1);
});

test('denied durable admission prevents runner and proposal calls',async()=>{
 const runtime=createCorrectionRuntime({...config,admitCycle:async()=>false,proposeEdits:async()=>assert.fail('unexpected proposal'),runIsolated:async()=>assert.fail('unexpected runner')});
 assert.equal((await runtime.run({edits:edits('broken')})).state,'denied');
});

test('review mismatch blocks corrected candidate handoff',async()=>{
 const runtime=createCorrectionRuntime({...config,reviewCandidate:async()=>({role:'security-reviewer',disposition:'approved',evidenceSha256:'0'.repeat(64)}),proposeEdits:async()=>edits('fixed'),runIsolated:async input=>report(input,null)});
 assert.equal((await runtime.run({edits:edits('broken')})).state,'review-blocked');
});
