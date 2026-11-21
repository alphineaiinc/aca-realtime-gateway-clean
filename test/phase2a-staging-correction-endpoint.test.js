"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {evaluateStagingCorrection}=require("../src/automation/phase2aStagingCorrectionEndpoint");
const repositoryId=1080201236,workflowId=422174901,sha="a".repeat(40);
const token="staging-only-fixture-token-0123456789";
function fixture(){
 const run={id:88,name:"ACA CI",status:"completed",conclusion:"failure",
  workflow_id:workflowId,head_sha:sha,repository:{id:repositoryId},
  head_repository:{id:repositoryId}};
 const link={repository:{pullRequest:{number:42,closingIssuesReferences:{
  pageInfo:{hasNextPage:false},
  nodes:[{number:23,repository:{databaseId:repositoryId}}]}}}};
 const calls=[];
 const github={rest:{
  actions:{getWorkflowRun:async()=>({data:run})},
  repos:{get:async()=>({data:{id:repositoryId}}),
   listPullRequestsAssociatedWithCommit:async()=>({data:[{number:42}]})},
  pulls:{get:async()=>({data:{number:42,state:"open",draft:false,
   head:{sha,repo:{id:repositoryId}},base:{repo:{id:repositoryId}}}})},
  issues:{get:async()=>({data:{number:23,state:"open",labels:[
   {name:"aca:auto/docs-test"},{name:"aca:auto/eligible"},{name:"aca:auto/active"}]}})}
 },graphql:async()=>link};
 const pool={connect:async()=>({async query(sql){
  calls.push(sql);
  if(sql.startsWith("SELECT current_user"))return {rows:[{
   db_role:"aca_p2_reader_a",broad_read:false}]};
  if(sql.includes("has_table_privilege"))return {rows:[{
   can_read_ledgers:true,can_mutate_ledgers:false,
   can_read_events:true,can_mutate_events:false}]};
  if(sql.includes("SELECT version FROM aca_automation.correction_ledgers"))
   return {rows:[{version:0}]};
  if(sql.includes("FROM aca_automation.correction_events"))return {rows:[]};
  return {rows:[]};
 },release(){calls.push("released");}})};
 const config={enabled:true,bearerToken:token,repositoryId,workflowId,
  owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",ledgerRole:"aca_p2_reader_a"};
 return {authorization:"Bearer "+token,request:{runId:88},config,github,pool,calls,run};
}
test("verified staging evidence produces approval recommendation but never a dispatch",async()=>{
 const x=fixture(),r=await evaluateStagingCorrection(x);
 assert.equal(r.status,200);
 assert.equal(r.body.state,"request_owner_approval");
 assert.equal(r.body.request.attempt,1);
 assert.equal(r.body.dispatched,false);
 assert.equal(r.body.mergeAuthorized,false);
 assert.equal(r.body.deployAuthorized,false);
 assert.equal(r.body.agentDispatchAuthorized,false);
 assert.equal(x.calls.filter(x=>x==="released").length,1);
});
test("missing/incorrect staging token or disabled route never queries GitHub or ledger",async()=>{
 for(const change of [
  x=>x.authorization="",x=>x.authorization="Bearer wrong",
  x=>x.config.enabled=false,x=>x.config.bearerToken=""
 ]){
  const x=fixture();change(x);
  x.github.rest.actions.getWorkflowRun=async()=>{throw Error("must not call");};
  const r=await evaluateStagingCorrection(x);
  assert.equal(r.status,401);assert.equal(r.body.agentDispatchAuthorized,false);
 }
});
test("supplied head, repository or PR fields are rejected: runId only",async()=>{
 for(const field of ["headSha","prNumber","repositoryId","action"]){
  const x=fixture();x.request[field]="untrusted";
  const r=await evaluateStagingCorrection(x);
  assert.equal(r.status,400);
 }
});
test("mismatched GitHub run identity and missing ledger fail safely",async()=>{
 const x=fixture();x.run.workflow_id=1;
 assert.equal((await evaluateStagingCorrection(x)).status,409);
 const y=fixture();y.pool=null;
 assert.equal((await evaluateStagingCorrection(y)).status,503);
});
test("success and missing correction ledger never become correction approval",async()=>{
 const x=fixture();x.run.conclusion="success";
 const r=await evaluateStagingCorrection(x);
 assert.equal(r.status,409);assert.equal(r.body.request,null);
 const y=fixture();y.pool.connect=async()=>({async query(sql){
  if(sql.startsWith("SELECT current_user"))return {rows:[{db_role:"aca_p2_reader_a",broad_read:false}]};
  if(sql.includes("has_table_privilege"))return {rows:[{can_read_ledgers:true,can_mutate_ledgers:false,can_read_events:true,can_mutate_events:false}]};
  if(sql.includes("SELECT version FROM aca_automation.correction_ledgers"))return {rows:[]};
  return {rows:[]};
 },release(){}});
 const z=await evaluateStagingCorrection(y);
 assert.equal(z.status,409);assert.equal(z.body.state,"verification_required");
});
