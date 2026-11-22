"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {observeWithTrustedLedger}=require("../src/automation/phase2aTrustedLedgerBridge");
const repositoryId=1080201236,workflowId=422174901,sha="a".repeat(40);
function fixtures({role="aca_p2_reader_a",broadRead=false,ledgerVersion=0,canMutate=false}={}){
 let released=0;const sql=[];
 const client={async query(statement){
  sql.push(statement);
  if(statement.startsWith("SELECT current_user"))
   return {rows:[{db_role:role,broad_read:broadRead}]};
  if(statement.includes("has_table_privilege"))return {rows:[{can_read_ledgers:true,can_mutate_ledgers:canMutate,can_read_events:true,can_mutate_events:false}]};
  if(statement.includes("SELECT version FROM aca_automation.correction_ledgers"))
   return {rows:[{version:ledgerVersion}]};
  if(statement.includes("FROM aca_automation.correction_events"))return {rows:[]};
  return {rows:[]};
 },release(){released++;}};
 const pool={connect:async()=>client};
 const event={action:"completed",repository:{id:repositoryId},workflow_run:{
  id:12,status:"completed",name:"ACA CI",workflow_id:workflowId,
  head_sha:sha,conclusion:"failure",
  repository:{id:repositoryId},head_repository:{id:repositoryId}}};
 const link={repository:{pullRequest:{number:42,closingIssuesReferences:{
  pageInfo:{hasNextPage:false},
  nodes:[{number:23,repository:{databaseId:repositoryId}}]
 }}}};
 const github={rest:{actions:{getWorkflowRun:async()=>({data:{
  id:12,workflow_id:workflowId,name:"ACA CI",status:"completed",
  conclusion:"failure",head_sha:sha,repository:{id:repositoryId},
  head_repository:{id:repositoryId}
 }})},repos:{
  get:async()=>({data:{id:repositoryId}}),
  listPullRequestsAssociatedWithCommit:async()=>({data:[{number:42}]})},
  pulls:{get:async()=>({data:{number:42,draft:false,state:"open",
   head:{sha,repo:{id:repositoryId}},base:{repo:{id:repositoryId}}}})},
  issues:{get:async()=>({data:{number:23,state:"open",labels:[
   {name:"aca:auto/docs-test"},{name:"aca:auto/eligible"},{name:"aca:auto/active"}]}})}
 },graphql:async()=>link};
 const args={pool,expectedDbRole:"aca_p2_reader_a",github,
 owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",event,
 expectedRepositoryId:repositoryId,expectedWorkflowId:workflowId};
 return {args,sql,get released(){return released;}};
}
test("authenticated scoped read role yields advisory request without dispatch",async()=>{
 const x=fixtures();
 const result=await observeWithTrustedLedger(x.args);
 assert.equal(result.state,"request_owner_approval");
 assert.equal(result.request.attempt,1);
 assert.equal(result.agentDispatchAuthorized,false);
 assert.equal(result.mergeAuthorized,false);
 assert.equal(result.deployAuthorized,false);
 assert.equal(result.source,"server_attested_readonly_ledger");
 assert.equal(x.released,1);
 assert.ok(x.sql.some(sql=>sql.startsWith("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")));
 assert.ok(x.sql.includes("COMMIT"));
 assert.ok(!x.sql.some(sql=>/^(INSERT|UPDATE|DELETE)/.test(sql)));
});
test("unexpected database role is rejected before querying correction data",async()=>{
 const x=fixtures({role:"postgres"});
 await assert.rejects(observeWithTrustedLedger(x.args),/unexpected_ledger_database_role/);
 assert.equal(x.released,1);
 assert.equal(x.sql.length,1);
});
test("broad database read privilege is rejected",async()=>{
 const x=fixtures({broadRead:true});
 await assert.rejects(observeWithTrustedLedger(x.args),/unexpected_ledger_database_role/);
 assert.equal(x.released,1);
});
test("no pool or unknown expected role never falls back to zero attempts",async()=>{
 const x=fixtures();
 await assert.rejects(observeWithTrustedLedger({...x.args,pool:null}),/missing_authenticated_readonly_ledger_configuration/);
 await assert.rejects(observeWithTrustedLedger({...x.args,expectedDbRole:"postgres;DROP"}),/missing_authenticated_readonly_ledger_configuration/);
});
test("corrupt or uninitialized ledger never allows a request",async()=>{
 const x=fixtures({ledgerVersion:1});
 const result=await observeWithTrustedLedger(x.args);
 assert.equal(result.state,"verification_required");
 assert.equal(result.request,null);
 assert.equal(x.released,1);
 assert.ok(x.sql.includes("ROLLBACK"));
});

test("unexpected write grants fail closed before any correction history query",async()=>{
 const x=fixtures({canMutate:true});
 await assert.rejects(observeWithTrustedLedger(x.args),/unsafe_ledger_database_grants/);
 assert.equal(x.released,1);
 assert.equal(x.sql.length,2);
 assert.ok(!x.sql.some(q=>q.startsWith("BEGIN TRANSACTION")));
});
