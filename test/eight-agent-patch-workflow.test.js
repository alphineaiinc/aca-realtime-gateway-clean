'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPatchPlanner,digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {createDraftWorkflow}=require('../src/automation/engineeringTeam/draftWorkflow');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const original='module.exports = 1;';
const edit={path:'src/example.js',beforeSha256:digest(original),replacement:'module.exports = 2;'};
function planner(){return createPatchPlanner({scope,files:[{path:edit.path,role:'backend-developer',text:original}]});}
test('bounded replacement produces pinned, immutable evidence without execution authority',()=>{
 const plan=planner().plan({role:'backend-developer',edits:[edit]});
 assert.equal(plan.scope.sha,scope.sha);assert.equal(plan.changes[0].afterSha256,digest(edit.replacement));assert.equal(plan.executionAuthorized,false);assert.ok(Object.isFrozen(plan.changes));
});
test('patch planner denies wrong role, stale content, path escape and duplicate edits',()=>{
 for(const [role,edits] of [['frontend-developer',[edit]],['security-reviewer',[edit]],['backend-developer',[{...edit,beforeSha256:'b'.repeat(64)}]],['backend-developer',[{...edit,path:'../example.js'}]],['backend-developer',[edit,edit]]])assert.throws(()=>planner().plan({role,edits}));
});
test('draft preparation binds passing fixture evidence to changes without GitHub write authority',async()=>{
 const workflow=createDraftWorkflow({planner:planner(),authorize:async()=>true,runFixtureTests:async p=>({evidenceSha256:p.evidenceSha256,checks:[{name:'fixture',status:'passed'}]})});
 const result=await workflow.prepare({role:'backend-developer',edits:[edit]});
 assert.equal(result.draft.draft,true);assert.equal(result.draft.writeAuthorized,false);assert.equal(result.releaseApproved,false);
});
test('failed, missing or stale checks deny draft preparation',async()=>{
 for(const response of [null,{evidenceSha256:'x',checks:[{name:'fixture',status:'passed'}]}]) {
  const w=createDraftWorkflow({planner:planner(),authorize:async()=>true,runFixtureTests:async()=>response});
  await assert.rejects(w.prepare({role:'backend-developer',edits:[edit]}));
 }
 const w=createDraftWorkflow({planner:planner(),authorize:async()=>false,runFixtureTests:async()=>assert.fail('runner invoked')});
 await assert.rejects(w.prepare({role:'backend-developer',edits:[edit]}));
});
