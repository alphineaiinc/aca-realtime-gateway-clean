'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProviderOutcome}=require('../src/automation/engineeringTeam/providerOutcome');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const binding='b'.repeat(64);
function fixture({breach=false,fail=false,attemptBudget='fixture-budget',attemptDigest='c'.repeat(64)}={}){
 const queries=[];
 const client={async query(sql,args){queries.push({sql,args});if(sql.startsWith('SELECT reserved'))return {rowCount:1,rows:[{model:'fixture',budget_id:attemptBudget,cost_evidence_sha256:attemptDigest,reserved_microusd:'400'}]};if(sql.startsWith('INSERT INTO engineering_team_provider_outcomes'))return {rowCount:1};if(fail&&sql.startsWith('INSERT INTO engineering_team_stops'))throw Error('fixture failure');return {rowCount:1};},release(){}};
 const service=createProviderOutcome({scope,pool:{connect:async()=>client},authenticate:async()=>({...scope,id:'owner',permission:'owner.approval'}),costEnvelope:{budgetId:'fixture-budget',evidenceSha256:'c'.repeat(64),executionAuthorized:false,assessUsage(model,u){assert.equal(model,'fixture');return {...u,actualMicrousd:2,breach};}}});
 return {service,queries};
}
test('assessed outcome ignores caller price and commits token breach with stop',async()=>{
 const {service,queries}=fixture({breach:true});
 assert.deepEqual(await service.record({credential:'owner',binding,usage:{inputTokens:1001,outputTokens:0,actualMicrousd:0}}),{outcome:'breach',executionAuthorized:false});
 assert.deepEqual(queries.find(q=>q.sql.startsWith('INSERT INTO engineering_team_provider_outcomes')).args,[binding,'breach',1001,0,2,'owner']);
 assert.ok(queries.some(q=>q.sql.startsWith('INSERT INTO engineering_team_stops')));
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
