'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {roles}=require('../src/automation/engineeringTeam/registry');
const {createAgentManager}=require('../src/automation/engineeringTeam/manager');
const {runOfflineTeam,sequence}=require('../src/automation/engineeringTeam/offlineTeam');
function setup(){const manager=createAgentManager({scopes:[{product:'aca',repository:'fixture/aca'}]});const task=manager.createTask({product:'aca',repository:'fixture/aca',subject:'Disposable feature'});return {manager,task};}
for(const role of sequence)test(role+' offline proposal contract',async()=>{
 const {manager,task}=setup();
 const p=await manager.propose({taskId:task.id,role,action:roles[role].action,adapter:async ctx=>{assert.equal(ctx.role.id,role);assert.equal(ctx.mode,'offline-proposal-only');assert.ok(Object.isFrozen(ctx.task));return role+' fixture proposal';}});
 assert.equal(p.approval,false);assert.equal(p.role,role);
});
test('eight roles execute in order with prior proposals',async()=>{
 const {manager,task}=setup();let count=0;
 const adapters=Object.fromEntries(sequence.map(role=>[role,async(ctx,prior)=>{assert.equal(prior.length,count++);return role+' fixture';}]));
 const result=await runOfflineTeam({manager,task,adapters});
 assert.equal(result.proposals.length,8);assert.equal(result.releaseApproved,false);
 assert.deepEqual(result.proposals.map(p=>p.role),sequence);
});
test('scope, role and forbidden actions denied before adapter',async()=>{
 const {manager,task}=setup();let calls=0;const adapter=async()=>{calls++;return 'fixture';};
 assert.throws(()=>manager.createTask({product:'other',repository:'fixture/aca',subject:'x'}));
 for(const [role,action] of [['backend-developer','merge'],['security-reviewer','approve'],['orchestrator','dispatch'],['unknown','plan']])await assert.rejects(manager.propose({taskId:task.id,role,action,adapter}));
 assert.equal(calls,0);
});
test('quarantine, stop and bounded attempts deny further work',async()=>{
 const {manager,task}=setup();const p={taskId:task.id,role:'qa-testing',action:'test-report',adapter:async()=> 'fixture'};
 await manager.propose(p);await manager.propose(p);await assert.rejects(manager.propose(p));
 manager.quarantine('devops');await assert.rejects(manager.propose({...p,role:'devops',action:'operations-report'}));
 manager.stop();await assert.rejects(manager.propose({...p,role:'project-manager',action:'plan'}));
 assert.ok(manager.audit().some(e=>e.decision==='stop'));
});
test('stop during execution discards result and audit excludes subject/output',async()=>{
 const {manager,task}=setup();
 await assert.rejects(manager.propose({taskId:task.id,role:'qa-testing',action:'test-report',adapter:async()=>{manager.stop();return 'private fixture output';}}));
 assert.doesNotMatch(JSON.stringify(manager.audit()),/private fixture output|Disposable feature/);
});
test('missing role adapter denies whole workflow before execution',async()=>{
 const {manager,task}=setup();await assert.rejects(runOfflineTeam({manager,task,adapters:{}}));
 assert.equal(manager.audit().length,1);
});
