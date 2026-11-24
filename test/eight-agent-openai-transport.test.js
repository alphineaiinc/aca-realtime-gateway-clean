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

test('async admission cannot substitute role, input or schema',async()=>{
 const request={role:'devops',mode:'proposal-only',input:'original',instructions:'fixture',schema:{type:'object'}};
 const t=createOpenAITransport({models,authorize:async role=>{assert.equal(role,'devops');request.role='orchestrator';request.input='substituted';request.schema.type='string';return true;},client:{responses:{create:async payload=>{assert.equal(payload.input,'original');assert.equal(payload.text.format.schema.type,'object');return {status:'completed',usage:{input_tokens:1,output_tokens:1},output_text:'{}'};}}}});
 assert.equal(await t.generate(request),'{}');
});
test('output usage breach prevents further provider calls',async()=>{
 let calls=0;
 const t=createOpenAITransport({models,maxOutputTokens:256,authorize:async()=>true,client:{responses:{create:async()=>{calls++;return {status:'completed',usage:{input_tokens:1,output_tokens:257},output_text:'{}'};}}}});
 const request={role:'devops',mode:'proposal-only',input:'{}',instructions:'fixture'};
 await assert.rejects(t.generate(request),/Provider request failed/);
 await assert.rejects(t.generate(request),/budget/);
 assert.equal(calls,1);
});

test('ambiguous provider outcomes halt the instance and preserve actual attempt accounting',async()=>{
 for(const outcome of ['throw','missing-usage','incomplete','over-budget']){
  let attempts=0,reservations=0;
  const t=createOpenAITransport({models,maxOutputTokens:256,authorize:async()=>true,budget:{reserve:async()=>{reservations++;return true;}},client:{responses:{create:async()=>{
   attempts++;
   if(outcome==='throw')throw Error('private fixture');
   if(outcome==='missing-usage')return {status:'completed',output_text:'{}'};
   return {status:outcome==='incomplete'?'incomplete':'completed',usage:{input_tokens:1,output_tokens:outcome==='over-budget'?257:1},output_text:'{}'};
  }}}});
  const request={role:'devops',mode:'proposal-only',input:'{}',instructions:'fixture'};
  await assert.rejects(t.generate(request),/Provider request failed/);
  await assert.rejects(t.generate(request),/budget/);
  assert.equal(attempts,1);
  assert.equal(reservations,1);
  assert.equal(t.usage().calls,1);
 }
});
test('ambiguous durable reservation never reaches provider or retries',async()=>{
 let reservations=0;
 const t=createOpenAITransport({models,authorize:async()=>true,budget:{reserve:async()=>{reservations++;throw Error('unknown commit outcome');}},client:{responses:{create:async()=>assert.fail('provider called')}}});
 const request={role:'devops',mode:'proposal-only',input:'{}',instructions:'fixture'};
 await assert.rejects(t.generate(request),/Provider request failed/);
 await assert.rejects(t.generate(request),/budget/);
 assert.equal(reservations,1);
 assert.equal(t.usage().calls,0);
});
