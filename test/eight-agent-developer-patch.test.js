'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPatchPlanner,digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {createDeveloperPatchAdapter}=require('../src/automation/engineeringTeam/developerPatchAdapter');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const files=[{path:'src/example.js',role:'backend-developer',text:'module.exports=1;'},{path:'src/ui.js',role:'frontend-developer',text:'module.exports=2;'}];
const edit={path:files[0].path,beforeSha256:digest(files[0].text),replacement:'module.exports=3;'};
const make=generate=>createDeveloperPatchAdapter({generate,files,planner:createPatchPlanner({scope,files})});
test('developer model receives only its approved inventory and returns actual replacement source',async()=>{
 const a=make(async r=>{assert.equal(r.role,'backend-developer');assert.equal(JSON.parse(r.input).files.length,1);assert.doesNotMatch(r.instructions,/UNTRUSTED/);return JSON.stringify({edits:[edit]});});
 const p=await a.propose({role:'backend-developer',subject:'UNTRUSTED fixture'});
 assert.equal(p.changes[0].replacement,edit.replacement);assert.equal(p.executionAuthorized,false);
});
test('model patch cannot change other role files, inject approval or stale digest',async()=>{
 for(const payload of [{edits:[{...edit,path:files[1].path,beforeSha256:digest(files[1].text)}]},{edits:[edit],approved:true},{edits:[{...edit,beforeSha256:'b'.repeat(64)}]}]){
  await assert.rejects(make(async()=>JSON.stringify(payload)).propose({role:'backend-developer',subject:'fixture'}));
 }
});
test('non-developer role never invokes generator',async()=>{
 await assert.rejects(make(async()=>assert.fail('generator invoked')).propose({role:'security-reviewer',subject:'fixture'}));
});
