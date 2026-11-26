'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFixtureBroker}=require('../src/automation/engineeringTeam/toolBroker');
const task={product:'aca',repository:'fixture/aca'},sha='a'.repeat(40);
function fixture(isActive){
 const decisions=[];
 const broker=createFixtureBroker({snapshots:[{...task,sha,files:[],issue:'fixture issue',ci:'fixture CI'}]});
 return {decisions,cap:broker.bind({task,sha,role:'project-manager',isActive,onDecision:(...args)=>decisions.push(args)})};
}
test('ambiguous active state never admits a fixture read',async()=>{
 for(const active of [false,undefined,1,'false',{},Promise.resolve(false)]){
  const f=fixture(()=>active);
  await assert.rejects(f.cap.read({action:'issue.read'}),/Capability denied/);
  assert.deepEqual(f.decisions,[['issue.read','deny']]);
 }
});
test('inherited action is not an explicit capability request',async()=>{
 const f=fixture(()=>true);
 const request=Object.create({action:'issue.read'});request.unrelated=true;
 await assert.rejects(f.cap.read(request),/Capability denied/);
 assert.equal((await f.cap.read({action:'issue.read'})).text,'fixture issue');
});
