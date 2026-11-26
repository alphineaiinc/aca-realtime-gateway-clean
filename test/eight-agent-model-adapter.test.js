'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createModelAdapters}=require('../src/automation/engineeringTeam/modelAdapter');
const {createAgentManager}=require('../src/automation/engineeringTeam/manager');
const {runOfflineTeam}=require('../src/automation/engineeringTeam/offlineTeam');
const {contract}=require('../src/automation/engineeringTeam/contracts');
const {roles}=require('../src/automation/engineeringTeam/registry');
test('all eight roles use structured model transport with untrusted input separated from instructions',async()=>{
 const seen=[];
 const adapters=createModelAdapters({generate:async request=>{
  seen.push(request);assert.equal(request.mode,'proposal-only');assert.equal(request.schema.additionalProperties,false);
  assert.doesNotMatch(request.instructions,/UNTRUSTED_FIXTURE/);
  assert.match(request.input,/UNTRUSTED_FIXTURE/);
  return JSON.stringify(Object.fromEntries(contract(request.role).fields.map(f=>[f,['fixture proposal']])));
 }});
 const manager=createAgentManager({scopes:[{product:'aca',repository:'fixture/aca'}],adapters});
 const task=manager.createTask({product:'aca',repository:'fixture/aca',subject:'UNTRUSTED_FIXTURE'});
 const result=await runOfflineTeam({manager,task});
 assert.equal(seen.length,8);assert.equal(result.releaseApproved,false);assert.equal(new Set(seen.map(x=>x.role)).size,8);
});
test('adapter rejects wrong role, invalid JSON, approval field and oversized response',async()=>{
 const role='qa-testing',ctx={role:roles[role],mode:'offline-proposal-only',task:{},prior:[]};
 for(const response of ['not json',JSON.stringify({approval:true}),'x'.repeat(17000)]){
  const a=createModelAdapters({generate:async()=>response});
  await assert.rejects(a[role](ctx));
 }
 const a=createModelAdapters({generate:async()=>{assert.fail('transport invoked');}});
 await assert.rejects(a[role]({...ctx,role:roles.devops}));
});
test('input budget rejects before model transport',async()=>{
 const a=createModelAdapters({generate:async()=>assert.fail('transport invoked'),maxInputBytes:1024});
 await assert.rejects(a.devops({role:roles.devops,mode:'offline-proposal-only',task:{subject:'x'.repeat(2000)},prior:[]}),/budget/);
});
