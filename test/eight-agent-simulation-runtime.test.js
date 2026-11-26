'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSimulationRuntime}=require('../src/automation/engineeringTeam/simulationRuntime');
const {sequence}=require('../src/automation/engineeringTeam/offlineTeam');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
function setup(overrides={}){
 const requests=[],models=[];let reservations=0,serial=0;const pending=new Map();
 const runtime=createSimulationRuntime({scope,issue:42,paths:['src/example.js'],authorize:async()=>true,budget:{async reserve(input){reservations++;const binding=String(++serial).padStart(64,'0');pending.set(binding,input.requestDigest);return {executionAuthorized:true,requestDigest:input.requestDigest,binding};},async consume(input){if(pending.get(input.binding)!==input.requestDigest)return false;pending.delete(input.binding);return true;}},
 fetchFixture:async(url,options)=>{
  requests.push(url);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  if(url.includes('/contents/'))return new Response(JSON.stringify({type:'file',path:'src/example.js',encoding:'base64',size:3,content:'YWJj'}));
  if(url.includes('/issues/'))return new Response(JSON.stringify({number:42,title:'UNTRUSTED_ISSUE',body:'fixture'}));
  if(url.includes('/actions/runs'))return new Response(JSON.stringify({workflow_runs:[{id:1,head_sha:scope.sha,status:'completed',conclusion:'success'}],total_count:1}));
  assert.fail('Unexpected URL');
 },modelFixture:async request=>{
  models.push(request);const input=JSON.parse(request.input);
  assert.equal(input.task.sha,scope.sha);assert.ok(input.evidence.length>0);assert.doesNotMatch(request.instructions,/UNTRUSTED_ISSUE/);
  return {status:'completed',usage:{input_tokens:100,output_tokens:20},output_text:JSON.stringify(Object.fromEntries(request.text.format.schema.required.map(f=>[f,['fixture proposal']])))};
 },...overrides});
 return {runtime,requests,models,reservations:()=>reservations};
}
test('full eight-agent simulated runtime uses approved GitHub evidence and reserves each model call',async()=>{
 const f=setup();const result=await f.runtime.run('fixture task');
 assert.deepEqual(result.proposals.map(p=>p.role),sequence);assert.equal(result.releaseApproved,false);
 assert.equal(result.mode,'simulation-only');assert.equal(f.reservations(),8);assert.equal(f.models.length,8);
 assert.deepEqual(result.usage,{calls:8,inputTokens:800,outputTokens:160});
 assert.ok(f.requests.length>8);assert.ok(result.audit.some(e=>e.reason==='tool:source.read'));
 await assert.rejects(f.runtime.run('second task'),/consumed/);
});
test('simulation denies provider when authorization rejects and never invokes model',async()=>{
 const f=setup({authorize:async req=>req.action!=='provider.simulate'});
 await assert.rejects(f.runtime.run('fixture'));assert.equal(f.models.length,0);assert.equal(f.reservations(),0);
});
test('simulation stops on malformed model output without advancing later roles',async()=>{
 let calls=0;const f=setup({modelFixture:async()=>{calls++;return {status:'completed',usage:{input_tokens:1,output_tokens:1},output_text:'{"approval":true}'};}});
 await assert.rejects(f.runtime.run('fixture'));assert.equal(calls,1);assert.equal(f.reservations(),1);
});
test('simulation quarantines role and halts subsequent workflow',async()=>{
 const f=setup();f.runtime.quarantine('solution-architect');
 await assert.rejects(f.runtime.run('fixture'));assert.equal(f.models.length,2);
});
