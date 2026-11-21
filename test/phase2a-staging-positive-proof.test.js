"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {verifyStagingProof,TEST_LABEL}=require("../src/automation/phase2aStagingPositiveProof");
const R=1080201236,W=422174901,HEAD="a".repeat(40);
const scope={owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",
 repositoryId:R,workflowId:W,runId:123,prNumber:44,issueNumber:43,
 expectedHeadSha:HEAD};
function fixture({labels=[TEST_LABEL],ledgerVersion=0,
  runConclusion="failure",head=HEAD,linkedIssue=43,prDraft=false,
  prState="open",repoId=R,associationCount=1,secondHead=head,
  failApi=false}={}){
 const calls=[];
 const run={id:123,name:"ACA CI",workflow_id:W,status:"completed",
  conclusion:runConclusion,head_sha:HEAD,repository:{id:R},
  head_repository:{id:R}};
 let n=0;
 const github={rest:{
  repos:{get:async()=>{calls.push("repo");return {data:{id:repoId}};},
   listPullRequestsAssociatedWithCommit:async()=>{
    calls.push("associated");return {data:Array.from({length:associationCount},
       (_,i)=>({number:44+i}))};}},
  actions:{getWorkflowRun:async()=>{calls.push("run");return {data:run};}},
  pulls:{get:async()=>{calls.push("pr");n++;return {data:{number:44,
   state:prState,draft:prDraft,head:{sha:n===2?secondHead:head,repo:{id:R}},
   base:{repo:{id:R}}}};}},
  issues:{get:async()=>{calls.push("issue");return {data:{number:43,
   state:"open",labels:labels.map(name=>({name}))}};}}
 },graphql:async()=>{calls.push("graphql");if(failApi)throw Error("fake failure");
  return {repository:{pullRequest:{number:44,closingIssuesReferences:{
   pageInfo:{hasNextPage:false},nodes:[{number:linkedIssue,
    repository:{databaseId:R}}]}}}};}};
 const ledgerClient={query:async(sql)=>{calls.push("sql");
  if(sql.includes("SELECT version FROM"))return {rows:[{version:ledgerVersion}]};
  if(sql.includes("SELECT sequence"))return {rows:[]};
  return {rows:[]};}};
 return {github,ledgerClient,calls};
}
const evaluate=(f,override={})=>verifyStagingProof({...scope,...f,...override});
test("fresh trusted staging proof is marked PROOF ONLY, never approval",async()=>{
 const f=fixture();const result=await evaluate(f,{expiresAt:Date.now()+120000});
 assert.equal(result.state,"staging_proof_only_ready");
 assert.equal(result.proofOnly,true);
 assert.equal(result.productionAuthorization,false);
 assert.equal(result.ownerApprovalRequested,false);
 for(const key of ["agentDispatchAuthorized","dispatched","mergeAuthorized",
  "deployAuthorized","signingAuthorized","ownerApprovalAuthorized"])
  assert.equal(result[key],false);
 assert.equal(f.calls.filter(x=>x==="pr").length,2);
 assert.equal(f.calls.includes("sql"),true);
});
test("expired and overlong proof expiry perform no API or ledger calls",async()=>{
 for(const expiresAt of [0,Date.now()-1,Date.now()+3600000]){
  const f=fixture();const r=await evaluate(f,{expiresAt});
  assert.equal(r.stage,"configuration");assert.deepEqual(f.calls,[]);
 }
});
test("not a real approval even when attached test labels do not include dispatch eligibility",async()=>{
 for(const labels of [[],["aca:auto/docs-test"],[TEST_LABEL,"aca:auto/active"],
   [TEST_LABEL,"aca:auto/manual-dispatch-requested"]]){
  const f=fixture({labels});const r=await evaluate(f,{expiresAt:Date.now()+120000});
  assert.equal(r.stage,"test_issue");assert.equal(r.productionAuthorization,false);
 }
});
test("untrusted run, issue links, forks and PR drift fail closed",async()=>{
 for(const opts of [{runConclusion:"success"},{linkedIssue:99},
  {repoId:100},{associationCount:2},{prDraft:true},
  {head:"b".repeat(40)},{prState:"closed"},
  {secondHead:"b".repeat(40)},{failApi:true}]){
  const f=fixture(opts);const r=await evaluate(f,{expiresAt:Date.now()+120000});
  assert.equal(r.state,"staging_proof_blocked",JSON.stringify(opts));
  assert.equal(r.ownerApprovalRequested,false);
 }
});
test("missing ledger and already-used ledger cannot become positive proof",async()=>{
 for(const version of [1,2]){
  const f=fixture({ledgerVersion:version});
  const r=await evaluate(f,{expiresAt:Date.now()+120000});
  assert.notEqual(r.state,"staging_proof_only_ready");
 }
 const f=fixture();
 f.ledgerClient.query=async(sql)=>sql.includes("SELECT version FROM")?
   {rows:[]}:{rows:[]};
 const r=await evaluate(f,{expiresAt:Date.now()+120000});
 assert.equal(r.stage,"evidence_unavailable");
});
