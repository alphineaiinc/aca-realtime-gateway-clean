'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {createCorrectionLoop}=require('../src/automation/engineeringTeam/correctionLoop');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const plan=n=>{const p={scope,role:'backend-developer',changes:[{fixture:n}]};return {...p,evidenceSha256:digest(JSON.stringify(p)),executionAuthorized:false};};
const report=(p,status,category)=>({evidenceSha256:p.evidenceSha256,profile:'disposable-no-network-no-secrets',status,category});
test('repairable failure permits bounded correction and retest',async()=>{
 const loop=createCorrectionLoop({scope,authorize:async()=>true,propose:async()=>plan(2),verify:async p=>report(p,p.changes[0].fixture===2?'passed':'failed','test-failure')});
 assert.deepEqual(await loop.run({plan:plan(1)}),{state:'candidate-passed',attempts:1,releaseApproved:false});
 await assert.rejects(loop.run({plan:plan(1)}),/denied/);
});
test('security failure and wrong evidence do not trigger correction',async()=>{
 for(const bad of [p=>report(p,'failed','security-failure'),()=>({status:'passed'})]){
  const loop=createCorrectionLoop({scope,authorize:async()=>true,propose:async()=>assert.fail('unexpected correction'),verify:async p=>bad(p)});
  assert.equal((await loop.run({plan:plan(1)})).attempts,0);
 }
});
test('retry limit and repeated patch stop the loop',async()=>{
 let n=1;
 for(const repeated of [false,true]){
  const loop=createCorrectionLoop({scope,authorize:async()=>true,propose:async()=>plan(repeated?1:++n),verify:async p=>report(p,'failed','syntax-failure')});
  const result=await loop.run({plan:plan(1)});assert.equal(result.state,repeated?'blocked':'limit');assert.equal(result.attempts,repeated?1:2);
 }
});
