"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {observeCorrectionHandoff}=require("../.github/scripts/phase2a-correction-observer");
const repositoryId=1080201236,workflowId=422174901,sha="a".repeat(40);
const allow=["aca:auto/docs-test","aca:auto/eligible","aca:auto/active"];
function fixtures(){
 const event={action:"completed",repository:{id:repositoryId},
  workflow_run:{id:77,name:"ACA CI",workflow_id:workflowId,head_sha:sha,
   status:"completed",conclusion:"failure",repository:{id:repositoryId},
   head_repository:{id:repositoryId}}};
 const pr={number:42,state:"open",draft:false,head:{sha,repo:{id:repositoryId}},
  base:{repo:{id:repositoryId}}};
 const link={repository:{pullRequest:{number:42,closingIssuesReferences:{
  pageInfo:{hasNextPage:false},nodes:[{number:23,repository:{databaseId:repositoryId}}]}}}};
 const github={rest:{actions:{getWorkflowRun:async()=>({data:{
  id:77,workflow_id:workflowId,name:"ACA CI",status:"completed",
  conclusion:"failure",head_sha:sha,repository:{id:repositoryId},
  head_repository:{id:repositoryId}
 }})},repos:{
  get:async()=>({data:{id:repositoryId}}),
  listPullRequestsAssociatedWithCommit:async()=>({data:[{number:42}]})},
  pulls:{get:async()=>({data:pr})},
  issues:{get:async()=>({data:{number:23,state:"open",labels:allow.map(name=>({name}))}})}
 },graphql:async()=>link};
 return {event,pr,link,github};
}
async function check({event,github,ledger}){
 return observeCorrectionHandoff({github,owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",
 event,expectedRepositoryId:repositoryId,expectedWorkflowId:workflowId,
 authenticatedLedgerClient:ledger});
}
test("verified GitHub association without ledger never creates a correction approval request",async()=>{
 const x=fixtures();const d=await check(x);
 assert.equal(d.state,"verification_required");assert.equal(d.request,null);
 assert.equal(d.agentDispatchAuthorized,false);
});
test("fork PR and stale PR head fail closed even with ledger",async()=>{
 const x=fixtures();x.pr.head.repo.id=3;
 let d=await check(x);assert.equal(d.state,"verification_required");
 x.pr.head.repo.id=repositoryId;x.pr.head.sha="b".repeat(40);
 d=await check(x);assert.equal(d.request,null);
});
test("ambiguous closing issues or multiple PR candidates never produce a request",async()=>{
 const x=fixtures();x.link.repository.pullRequest.closingIssuesReferences.nodes.push({
  number:24,repository:{databaseId:repositoryId}});
 assert.equal((await check(x)).state,"verification_required");
 const y=fixtures();y.github.rest.repos.listPullRequestsAssociatedWithCommit=async()=>({
  data:[{number:42},{number:43}]});
 assert.equal((await check(y)).state,"verification_required");
});
test("unverified issue labels, wrong repo, or API failures remain safe",async()=>{
 const x=fixtures();x.github.rest.issues.get=async()=>({data:{number:23,state:"open",labels:[]}});
 assert.equal((await check(x)).request,null);
 const y=fixtures();y.github.rest.repos.get=async()=>({data:{id:2}});
 assert.equal((await check(y)).request,null);
 const z=fixtures();z.github.graphql=async()=>{throw new Error("api offline");};
 assert.equal((await check(z)).request,null);
});
test("successful CI does not query PR associations",async()=>{
 const x=fixtures();x.event.workflow_run.conclusion="success";
 x.github.rest.repos.get=async()=>{throw new Error("should not call");};
 const d=await check(x);assert.equal(d.state,"not_applicable");
});

test("forged, stale or missing GitHub workflow-run evidence fails closed",async()=>{
 for(const change of [
   x=>x.github.rest.actions.getWorkflowRun=async()=>({data:{id:77,workflow_id:workflowId,name:"ACA CI",status:"completed",conclusion:"success",head_sha:sha,repository:{id:repositoryId},head_repository:{id:repositoryId}}}),
   x=>x.github.rest.actions.getWorkflowRun=async()=>{throw new Error("unavailable");},
   x=>delete x.github.rest.actions.getWorkflowRun
 ]){
  const x=fixtures();change(x);const d=await check(x);
  assert.equal(d.state,"verification_required");assert.equal(d.request,null);
 }
});
