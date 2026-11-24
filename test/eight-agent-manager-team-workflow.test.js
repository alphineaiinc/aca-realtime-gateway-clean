'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {contract}=require('../src/automation/engineeringTeam/contracts');
const {createAgentManager}=require('../src/automation/engineeringTeam/manager');
const {sequence}=require('../src/automation/engineeringTeam/offlineTeam');
const {createManagerTeamWorkflow}=require('../src/automation/engineeringTeam/managerTeamWorkflow');
const fixture=role=>Object.fromEntries(contract(role).fields.map(f=>[f,[role+' fixture']]));
function setup(overrides={}){const adapters=Object.fromEntries(sequence.map(role=>[role,async()=>fixture(role)]));Object.assign(adapters,overrides);const manager=createAgentManager({scopes:[{product:'aca',repository:'fixture/aca'}],adapters});return {manager,workflow:createManagerTeamWorkflow({manager})};}
const input={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40),subject:'fixture task'};
test('manager runs all eight trusted agents in dependency order',async()=>{
 const {manager,workflow}=setup();const result=await workflow.run(input);
 assert.equal(result.state,'completed');assert.equal(result.completed,8);assert.deepEqual(result.proposals.map(p=>p.role),sequence);
 assert.equal(result.releaseApproved,false);assert.equal(result.executionAuthorized,false);
 assert.equal(manager.audit().filter(e=>e.decision==='result').length,8);
});
test('agent failure stops downstream handoffs',async()=>{
 const {workflow}=setup({'backend-developer':async()=>{throw Error('fixture failure');}});
 const result=await workflow.run(input);assert.equal(result.state,'failed');assert.equal(result.completed,3);
});
test('stop prevents subsequent workflow and overlapping run is denied',async()=>{
 let release;const wait=new Promise(r=>{release=r;});const {workflow}=setup({orchestrator:async()=>{await wait;return fixture('orchestrator');}});
 const run=workflow.run(input);await assert.rejects(workflow.run(input),/unavailable/);workflow.stop();release();
 assert.equal((await run).state,'stopped');await assert.rejects(workflow.run(input),/unavailable/);
});
