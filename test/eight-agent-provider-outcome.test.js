'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProviderOutcome}=require('../src/automation/engineeringTeam/providerOutcome');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const binding='b'.repeat(64);
function fixture({breach=false,fail=false,alertFail=false,alreadyStopped=false,attemptBudget='fixture-budget',attemptDigest='c'.repeat(64)}={}){
 const queries=[];
 const client={async query(sql,args){queries.push({sql,args});if(sql.startsWith('SELECT reserved'))return {rowCount:1,rows:[{model:'fixture',budget_id:attemptBudget,cost_evidence_sha256:attemptDigest,reserved_microusd:'400'}]};if(sql.startsWith('INSERT INTO engineering_team_provider_outcomes'))return {rowCount:1};if(fail&&sql.startsWith('INSERT INTO engineering_team_stops'))throw Error('fixture failure');if(alreadyStopped&&sql.startsWith('INSERT INTO engineering_team_stops'))return {rowCount:0};if(alertFail&&sql.startsWith('INSERT INTO engineering_team_governance_alerts'))throw Error('alert fixture failure');return {rowCount:1};},release(){}};
 const service=createProviderOutcome({scope,pool:{connect:async()=>client},authenticate:async()=>({...scope,id:'owner',permission:'owner.approval'}),costEnvelope:{budgetId:'fixture-budget',evidenceSha256:'c'.repeat(64),executionAuthorized:false,assessUsage(model,u){assert.equal(model,'fixture');return {...u,actualMicrousd:2,breach};}}});
 return {service,queries};
}
test('assessed outcome ignores caller price and commits token breach with stop',async()=>{
 const {service,queries}=fixture({breach:true});
 assert.deepEqual(await service.record({credential:'owner',binding,usage:{inputTokens:1001,outputTokens:0,actualMicrousd:0}}),{outcome:'breach',executionAuthorized:false});
 assert.deepEqual(queries.find(q=>q.sql.startsWith('INSERT INTO engineering_team_provider_outcomes')).args,[binding,'breach',1001,0,2,'owner']);
 assert.ok(queries.some(q=>q.sql.startsWith('INSERT INTO engineering_team_stops')));
 assert.ok(queries.some(q=>q.sql.startsWith('INSERT INTO engineering_team_governance_alerts')));
 assert.equal(queries.at(-1).sql,'COMMIT');
});
test('failed stop rolls back outcome transaction',async()=>{
 const {service,queries}=fixture({breach:true,fail:true});
 await assert.rejects(service.record({credential:'owner',binding,usage:{inputTokens:1001,outputTokens:0}}),/fixture failure/);
 assert.equal(queries.at(-1).sql,'ROLLBACK');
 assert.ok(!queries.some(q=>q.sql==='COMMIT'));
});

test('wrong budget rolls back before outcome or stop writes',async()=>{
 const {service,queries}=fixture({attemptBudget:'other-budget'});
 await assert.rejects(service.record({credential:'owner',binding,usage:{inputTokens:1,outputTokens:0}}),/Outcome budget denied/);
 assert.equal(queries.at(-1).sql,'ROLLBACK');
 assert.ok(!queries.some(q=>q.sql.startsWith('INSERT')||q.sql==='COMMIT'));
});

test('changed cost evidence denies reconciliation without writes',async()=>{
 const {service,queries}=fixture({attemptDigest:'d'.repeat(64)});
 await assert.rejects(service.record({credential:'owner',binding,usage:{inputTokens:1,outputTokens:0}}),/Outcome cost evidence denied/);
 assert.equal(queries.at(-1).sql,'ROLLBACK');
 assert.ok(!queries.some(q=>q.sql.startsWith('INSERT')));
});

test('provider stop journal is idempotent and atomic',async()=>{
 const existing=fixture({breach:true,alreadyStopped:true});
 await existing.service.record({credential:'owner',binding,usage:{inputTokens:1001,outputTokens:0}});
 assert.ok(!existing.queries.some(q=>q.sql.startsWith('INSERT INTO engineering_team_governance_alerts')));
 const failed=fixture({breach:true,alertFail:true});
 await assert.rejects(failed.service.record({credential:'owner',binding,usage:{inputTokens:1001,outputTokens:0}}),/alert fixture failure/);
 assert.equal(failed.queries.at(-1).sql,'ROLLBACK');
});

const {createOpenAITransport}=require('../src/automation/engineeringTeam/openaiTransport');
const {digest}=require('../src/automation/engineeringTeam/patchPlanner');
const providerRoles=['orchestrator','project-manager','solution-architect','backend-developer','frontend-developer','qa-testing','security-reviewer','devops'];
const providerModels=Object.fromEntries(providerRoles.map(r=>[r,'fixture-model']));
const providerRequest={role:'orchestrator',mode:'proposal-only',input:'fixture',instructions:'fixture',schema:{type:'object'}};
const providerRequestDigest=digest(JSON.stringify({role:providerRequest.role,mode:providerRequest.mode,input:providerRequest.input,instructions:providerRequest.instructions,schema:providerRequest.schema,model:providerModels[providerRequest.role]}));
function providerClient(calls){return {responses:{create:async(...args)=>{calls.push(args);return {status:'completed',output_text:'{}',usage:{input_tokens:1,output_tokens:1}};}}};}
test('OpenAI transport refuses configuration without request-bound reserve and consume',()=>{
 assert.throws(()=>createOpenAITransport({client:providerClient([]),models:providerModels,authorize:async()=>true}),/Request-bound dispatch admission required/);
 assert.throws(()=>createOpenAITransport({client:providerClient([]),models:providerModels,authorize:async()=>true,budget:{reserve:async()=>true}}),/Request-bound dispatch admission required/);
});
test('offline provider reservation cannot authorize a paid SDK invocation',async()=>{
 const calls=[];
 const transport=createOpenAITransport({client:providerClient(calls),models:providerModels,authorize:async()=>true,budget:{reserve:async()=>({reserved:true,executionAuthorized:false,requestDigest:providerRequestDigest,binding:'b'.repeat(64)}),consume:async()=>true}});
 await assert.rejects(transport.generate(providerRequest),/Provider request failed/);
 assert.equal(calls.length,0);assert.equal(transport.usage().calls,0);
});
test('request-bound dispatch reservation is consumed before provider side effect',async()=>{
 const calls=[],admissions=[];
 const transport=createOpenAITransport({client:providerClient(calls),models:providerModels,authorize:async()=>true,budget:{
  reserve:async value=>{admissions.push(['reserve',value]);return {executionAuthorized:true,requestDigest:value.requestDigest,binding:'b'.repeat(64)};},
  consume:async value=>{admissions.push(['consume',value]);return true;}
 }});
 assert.equal(await transport.generate(providerRequest),'{}');
 assert.equal(calls.length,1);assert.equal(admissions.length,2);
 assert.equal(admissions[0][0],'reserve');assert.equal(admissions[1][0],'consume');
 assert.equal(admissions[0][1].requestDigest,admissions[1][1].requestDigest);
});
test('provider SDK is not called when durable reservation consumption is denied',async()=>{
 const calls=[];
 const transport=createOpenAITransport({client:providerClient(calls),models:providerModels,authorize:async()=>true,budget:{
  reserve:async value=>({executionAuthorized:true,requestDigest:value.requestDigest,binding:'c'.repeat(64)}),consume:async()=>false
 }});
 await assert.rejects(transport.generate(providerRequest),/Provider request failed/);
 assert.equal(calls.length,0);
});
