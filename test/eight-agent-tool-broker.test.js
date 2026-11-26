'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFixtureBroker}=require('../src/automation/engineeringTeam/toolBroker');
const {createAgentManager}=require('../src/automation/engineeringTeam/manager');
const {roles}=require('../src/automation/engineeringTeam/registry');
const {contract}=require('../src/automation/engineeringTeam/contracts');
const sha='a'.repeat(40);
const snapshot={product:'aca',repository:'fixture/aca',sha,issue:'fixture issue',ci:'fixture CI',files:[{path:'src/example.js',text:'fixture source'}]};
function bind(role,options={}){
 const broker=createFixtureBroker({snapshots:[snapshot]});
 return broker.bind({task:snapshot,role,sha,isActive:()=>true,onDecision:()=>{},...options});
}
test('role capability restricts source and CI access',async()=>{
 const s=bind('project-manager');
 assert.equal((await s.read({action:'issue.read'})).text,'fixture issue');
 await assert.rejects(s.read({action:'source.read',path:'src/example.js'}));
 await assert.rejects(s.read({action:'ci.read'}));
});
test('scope and pinned SHA cannot be overridden',async()=>{
 for(const s of [bind('qa-testing',{sha:'b'.repeat(40)}),bind('qa-testing',{task:{...snapshot,repository:'other/repo'}})])await assert.rejects(s.read({action:'issue.read'}));
 await assert.rejects(bind('qa-testing').read({action:'issue.read',repository:'other/repo'}));
});
test('source traversal, unknown files and write requests denied',async()=>{
 const s=bind('backend-developer');
 for(const path of ['../src/example.js','/src/example.js','.env','src/missing.js'])await assert.rejects(s.read({action:'source.read',path}));
 await assert.rejects(s.read({action:'source.write',path:'src/example.js'}));
 assert.equal((await s.read({action:'source.read',path:'src/example.js'})).sha,sha);
});
test('budget, revocation and inactive invocation deny reads',async()=>{
 const s=bind('qa-testing',{maxReads:1});await s.read({action:'ci.read'});await assert.rejects(s.read({action:'ci.read'}));
 const t=bind('qa-testing');t.close();await assert.rejects(t.read({action:'ci.read'}));
 await assert.rejects(bind('qa-testing',{isActive:()=>false}).read({action:'ci.read'}));
});
test('manager binds snapshot and revokes retained tool after proposal',async()=>{
 let retained;
 const adapters=Object.fromEntries(Object.keys(roles).map(role=>[role,async ctx=>{
 if(role==='qa-testing'){retained=ctx.tools;assert.equal((await retained.read({action:'ci.read'})).text,'fixture CI');}
 return Object.fromEntries(contract(role).fields.map(f=>[f,['fixture']]));
 }]));
 const manager=createAgentManager({scopes:[{product:'aca',repository:'fixture/aca'}],adapters,broker:createFixtureBroker({snapshots:[snapshot]})});
 assert.throws(()=>manager.createTask({product:'aca',repository:'fixture/aca',subject:'fixture'}));
 const task=manager.createTask({product:'aca',repository:'fixture/aca',subject:'fixture',sha});
 await manager.propose({taskId:task.id,role:'qa-testing',action:'test-report'});
 await assert.rejects(retained.read({action:'ci.read'}));
 assert.ok(manager.audit().some(e=>e.reason==='tool:ci.read'&&e.decision==='allow'));
});
