'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createGitHubReadTransport}=require('../src/automation/engineeringTeam/githubReadTransport');
const {createModelAdapters}=require('../src/automation/engineeringTeam/modelAdapter');
const {createOpenAITransport}=require('../src/automation/engineeringTeam/openaiTransport');
const {roles}=require('../src/automation/engineeringTeam/registry');
const {contract}=require('../src/automation/engineeringTeam/contracts');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
test('GitHub transport uses fixed origin GET and pinned source revision',async()=>{
 const t=createGitHubReadTransport({token:'fixture',repository:scope.repository,fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.github.com/repos/fixture/aca/contents/src/example.js?ref='+scope.sha);
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  return new Response(JSON.stringify({type:'file',path:'src/example.js',encoding:'base64',size:3,content:'YWJj'}));
 }});
 assert.equal((await t.readSource({...scope,path:'src/example.js'})).text,'abc');
 await assert.rejects(t.readSource({...scope,path:'../secret'}));
});
test('wrong CI revision is rejected',async()=>{
 const t=createGitHubReadTransport({token:'fixture',fetchImpl:async()=>new Response(JSON.stringify({workflow_runs:[{head_sha:'b'.repeat(40)}]}))});
 await assert.rejects(t.readCI(scope));
});
test('model receives approved evidence as data, not instructions',async()=>{
 const role='qa-testing';
 const a=createModelAdapters({evidencePlan:{[role]:[{action:'ci.read'}]},generate:async r=>{
  assert.match(r.input,/UNTRUSTED_EVIDENCE/);assert.doesNotMatch(r.instructions,/UNTRUSTED_EVIDENCE/);
  return JSON.stringify(Object.fromEntries(contract(role).fields.map(f=>[f,['fixture']])));
 }});
 await a[role]({role:roles[role],mode:'offline-proposal-only',task:scope,prior:[],tools:{read:async()=>({text:'UNTRUSTED_EVIDENCE'})}});
});
test('persistent reservation denial prevents provider call',async()=>{
 const t=createOpenAITransport({models:Object.fromEntries(Object.keys(roles).map(r=>[r,'fixture'])),authorize:async()=>true,budget:{async reserve(){throw Error('exhausted');},async consume(){return false;}},client:{responses:{create:async()=>assert.fail('provider called')}}});
 await assert.rejects(t.generate({role:'devops',mode:'proposal-only',input:'{}',instructions:'fixture'}));
 assert.equal(t.usage().calls,0);
});
