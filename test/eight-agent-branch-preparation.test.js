'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPatchPlanner,digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {prepareBranch}=require('../src/automation/engineeringTeam/branchPreparation');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const files=[{path:'src/example.js',text:'module.exports=1;',role:'backend-developer'}];
const plan=createPatchPlanner({scope,files}).plan({role:'backend-developer',edits:[{path:files[0].path,beforeSha256:digest(files[0].text),replacement:'module.exports=2;'}]});
test('branch preparation binds exact parent and source replacement without execution authority',()=>{
 const branch=prepareBranch({scope,files,plan});
 assert.match(branch.branch,/^aca-agent-draft-[a-f0-9]{16}$/);
 assert.equal(branch.parentSha,scope.sha);assert.equal(branch.executionAuthorized,false);
 assert.equal(branch.files[0].content,'module.exports=2;');
 assert.equal(branch.binding,prepareBranch({scope,files,plan}).binding);
});
test('branch preparation denies altered source, scope or patch evidence',()=>{
 assert.throws(()=>prepareBranch({scope,files:[{...files[0],text:'stale'}],plan}));
 assert.throws(()=>prepareBranch({scope:{...scope,sha:'b'.repeat(40)},files,plan}));
 assert.throws(()=>prepareBranch({scope,files,plan:{...plan,changes:[{...plan.changes[0],replacement:'module.exports=3;'}]}}));
});
