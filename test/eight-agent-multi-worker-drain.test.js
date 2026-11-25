'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createMultiWorkerDrain}=require('../src/automation/engineeringTeam/multiWorkerDrain');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const roles=['backend-developer','frontend-developer'];
const auth=async credential=>({...scope,id:credential,role:credential,permission:'queue.work'});
const config=(fn,authenticate=auth)=>({scope,authenticate,workers:roles.map(role=>({role,credential:role,worker:{runOnce:fn}}))});
test('independent workers drain concurrently and retry queued work immediately',async()=>{
 const counts=new Map();let active=0,peak=0;
 const drain=createMultiWorkerDrain(config(async ({role})=>{
  active++;peak=Math.max(peak,active);await Promise.resolve();active--;
  const n=(counts.get(role)||0)+1;counts.set(role,n);
  return n===3?{state:'idle'}:{state:n===1?'queued':'succeeded',releaseApproved:false};
 }));
 const result=await drain.run();assert.equal(result.state,'idle');assert.equal(peak,2);
 assert.equal(result.results.every(r=>r.retried===1&&r.succeeded===1),true);
 assert.equal(drain.executionAllowed(),false);
});
test('invalid worker identity prevents every worker from running',async()=>{
 const drain=createMultiWorkerDrain(config(async()=>assert.fail('unexpected execution'),async c=>({...await auth(c),sha:'b'.repeat(40)})));
 assert.equal((await drain.run()).state,'denied');
});
test('unknown outcome stops further execution without automatic replay',async()=>{
 const drain=createMultiWorkerDrain(config(async ({role})=>{if(role===roles[0])throw Error('fixture');return {state:'idle'};}));
 assert.equal((await drain.run()).state,'failed');await assert.rejects(drain.run(),/unavailable/);
});
