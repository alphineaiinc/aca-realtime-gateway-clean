'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {roles}=require('../src/automation/engineeringTeam/registry');
const {contract,validateProposal}=require('../src/automation/engineeringTeam/contracts');
const {createAgentManager}=require('../src/automation/engineeringTeam/manager');
const {runOfflineTeam,sequence}=require('../src/automation/engineeringTeam/offlineTeam');
function fixture(role){return Object.fromEntries(contract(role).fields.map(field=>[field,[role+' '+field+' fixture']]));}
function setup(overrides={}){
 const adapters=Object.fromEntries(sequence.map(role=>[role,async()=>fixture(role)]));
 Object.assign(adapters,overrides);
 const manager=createAgentManager({scopes:[{product:'aca',repository:'fixture/aca'}],adapters});
 const task=manager.createTask({product:'aca',repository:'fixture/aca',subject:'Disposable feature'});
 return {manager,task,adapters};
}
for(const role of sequence)test(role+' specialized contract',async()=>{
 const {manager,task}=setup({[role]:async ctx=>{assert.equal(ctx.role.id,role);assert.equal(ctx.mode,'offline-proposal-only');assert.ok(Object.isFrozen(ctx.task));assert.deepEqual(ctx.contract.fields,contract(role).fields);return fixture(role);}});
 const p=await manager.propose({taskId:task.id,role,action:roles[role].action});
 assert.equal(p.approval,false);assert.deepEqual(p.output,fixture(role));assert.ok(Object.isFrozen(p.output));
});
test('eight roles execute in order with prior proposals',async()=>{
 let count=0;const {manager,task}=setup(Object.fromEntries(sequence.map(role=>[role,async ctx=>{assert.equal(ctx.prior.length,count++);return fixture(role);}])));
 const result=await runOfflineTeam({manager,task});
 assert.equal(result.proposals.length,8);assert.equal(result.releaseApproved,false);
 assert.deepEqual(result.proposals.map(p=>p.role),sequence);
});
test('scope, role and forbidden actions denied before adapter',async()=>{
 let calls=0;const {manager,task}=setup({'backend-developer':async()=>{calls++;return fixture('backend-developer');}});
 assert.throws(()=>manager.createTask({product:'other',repository:'fixture/aca',subject:'x'}));
 for(const [role,action] of [['backend-developer','merge'],['security-reviewer','approve'],['orchestrator','dispatch'],['unknown','plan']])await assert.rejects(manager.propose({taskId:task.id,role,action}));
 assert.equal(calls,0);
});
test('quarantine, stop and bounded attempts deny further work',async()=>{
 const {manager,task}=setup();const p={taskId:task.id,role:'qa-testing',action:'test-report'};
 await manager.propose(p);await manager.propose(p);await assert.rejects(manager.propose(p));
 manager.quarantine('devops');await assert.rejects(manager.propose({...p,role:'devops',action:'operations-report'}));
 manager.stop();await assert.rejects(manager.propose({...p,role:'project-manager',action:'plan'}));
 assert.ok(manager.audit().some(e=>e.decision==='stop'));
});
test('stop during execution discards result and audit excludes subject/output',async()=>{
 let manager;const s=setup({'qa-testing':async()=>{manager.stop();return fixture('qa-testing');}});manager=s.manager;
 await assert.rejects(manager.propose({taskId:s.task.id,role:'qa-testing',action:'test-report'}));
 assert.doesNotMatch(JSON.stringify(manager.audit()),/qa-testing testCases fixture|Disposable feature/);
});
test('missing trusted adapter denies manager construction',()=>{
 assert.throws(()=>createAgentManager({scopes:[{product:'aca',repository:'fixture/aca'}],adapters:{}}),/Trusted adapter/);
});
test('caller cannot replace trusted adapter or mutate registry after construction',async()=>{
 const {manager,task,adapters}=setup();let invoked=false;
 adapters['qa-testing']=async()=>{invoked=true;return fixture('qa-testing');};
 const p=await manager.propose({taskId:task.id,role:'qa-testing',action:'test-report',adapter:async()=>{invoked=true;return fixture('qa-testing');}});
 assert.equal(invoked,false);assert.equal(p.approval,false);
});
test('structured output rejects privileged fields, missing fields and excessive text',()=>{
 const good=fixture('security-reviewer');
 for(const bad of [{...good,approval:true},{findings:['x']},{...good,findings:['x'.repeat(1001)]},'approve'])assert.throws(()=>validateProposal('security-reviewer',bad));
});
test('invalid role output fails closed',async()=>{
 const {manager,task}=setup({'security-reviewer':async()=>({...fixture('security-reviewer'),approved:true})});
 await assert.rejects(manager.propose({taskId:task.id,role:'security-reviewer',action:'security-report'}));
});
