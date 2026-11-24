'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createParallelPlan,stages}=require('../src/automation/engineeringTeam/parallelPlan');
const {contract}=require('../src/automation/engineeringTeam/contracts');
const proposal=({taskId,role})=>({taskId,role,approval:false,output:Object.fromEntries(contract(role).fields.map(f=>[f,['fixture']]))});
test('eight roles execute with stage barriers and at most two concurrent proposals',async()=>{
 let active=0,peak=0;const seen=[];
 const plan=createParallelPlan({execute:async input=>{
  active++;peak=Math.max(peak,active);seen.push([input.role,input.prior.length]);
  await Promise.resolve();active--;return proposal(input);
 }});
 const result=await plan.run({taskId:'fixture'});
 assert.equal(result.state,'completed');assert.equal(result.completed,8);assert.equal(peak,2);
 assert.deepEqual(seen,stages.flatMap((stage,i)=>stage.map(role=>[role,stages.slice(0,i).flat().length])));
 assert.equal(result.releaseApproved,false);assert.equal(plan.executionAllowed(),false);
});
test('failed parallel stage prevents downstream roles',async()=>{
 const seen=[];const plan=createParallelPlan({execute:async input=>{seen.push(input.role);if(input.role==='backend-developer')throw Error('fixture');return proposal(input);}});
 const result=await plan.run({taskId:'fixture'});assert.equal(result.state,'failed');assert.equal(seen.includes('qa-testing'),false);
});
test('stop and overlapping runs are denied',async()=>{
 let release;const wait=new Promise(r=>{release=r;});
 const plan=createParallelPlan({execute:async input=>{await wait;return proposal(input);}});
 const run=plan.run({taskId:'fixture'});await assert.rejects(plan.run({taskId:'other'}),/denied/);plan.stop();release();
 assert.equal((await run).state,'stopped');await assert.rejects(plan.run({taskId:'fixture'}),/denied/);
});
