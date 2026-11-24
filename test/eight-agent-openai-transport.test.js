'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {roles}=require('../src/automation/engineeringTeam/registry');
const {contract}=require('../src/automation/engineeringTeam/contracts');
const {createOpenAITransport}=require('../src/automation/engineeringTeam/openaiTransport');
const {createModelAdapters}=require('../src/automation/engineeringTeam/modelAdapter');
const {createAgentManager}=require('../src/automation/engineeringTeam/manager');
const {runOfflineTeam}=require('../src/automation/engineeringTeam/offlineTeam');
const models=Object.fromEntries(Object.keys(roles).map(r=>[r,'fixture-model']));
test('eight roles use authorized SDK-shaped mock with bounded requests and usage accounting',async()=>{
 const calls=[];
 const transport=createOpenAITransport({models,authorize:async()=>true,client:{responses:{async create(request,options){
  calls.push(request);assert.equal(request.store,false);assert.equal(options.maxRetries,0);assert.equal(options.timeout,30000);
  return {status:'completed',usage:{input_tokens:100,output_tokens:50},output_text:JSON.stringify(Object.fromEntries(request.text.format.schema.required.map(f=>[f,['fixture']])) )};
 }}}});
 const manager=createAgentManager({scopes:[{product:'aca',repository:'fixture/aca'}],adapters:createModelAdapters({generate:transport.generate})});
 const task=manager.createTask({product:'aca',repository:'fixture/aca',subject:'fixture'});
 assert.equal((await runOfflineTeam({manager,task})).proposals.length,8);
 assert.deepEqual(transport.usage(),{calls:8,inputTokens:800,outputTokens:400});
 await assert.rejects(transport.generate({role:'devops',mode:'proposal-only',input:'{}',instructions:'fixture'}),/budget/);
 assert.equal(calls.length,8);
});
test('authorization denial never contacts mock provider',async()=>{
 const t=createOpenAITransport({models,authorize:async()=>false,client:{responses:{create:async()=>assert.fail('provider called')}}});
 await assert.rejects(t.generate({role:'devops',mode:'proposal-only',input:'{}',instructions:'fixture'}),/authorization/);
 assert.equal(t.usage().calls,0);
});
test('incomplete response and provider errors fail closed without raw errors',async()=>{
 const t=createOpenAITransport({models,authorize:async()=>true,client:{responses:{create:async()=>{throw Error('private fixture');}}}});
 await assert.rejects(t.generate({role:'devops',mode:'proposal-only',input:'{}',instructions:'fixture'}),/^Error: Provider request failed$/);
 assert.equal(t.usage().calls,1);
});
