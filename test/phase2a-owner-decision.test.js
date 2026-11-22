"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createCorrectionHandoff}=require("../src/automation/phase2aCorrectionHandoff");
const {makeOwnerDecisionPacket,recordOwnerDecision,ownerReviewMarkdown,TTL_MS}=
 require("../src/automation/phase2aOwnerDecision");
const REPO=1080201236,WORKFLOW=422174901,OWNER=230486228,HEAD="a".repeat(40);
function verified(){
 const event={action:"completed",repository:{id:REPO},workflow_run:{
  id:551,name:"ACA CI",workflow_id:WORKFLOW,status:"completed",conclusion:"failure",
  head_sha:HEAD,repository:{id:REPO},head_repository:{id:REPO}
 }};
 return createCorrectionHandoff({
  event,expectedRepositoryId:REPO,expectedWorkflowId:WORKFLOW,
  pr:{state:"open",draft:false,number:49,issueNumber:48,headSha:HEAD,
   repositoryId:REPO,baseRepositoryId:REPO},
  verifiedIssueLink:true,
  history:{attempts:0,unchangedFailureCount:0,headSha:HEAD,
   repositoryId:REPO,prNumber:49,issueNumber:48}
 });
}
function options(){return {handoff:verified(),repositoryId:REPO,ownerId:OWNER,now:1700000000000};}
function invariant(r){
 for(const key of ["agentDispatchAuthorized","dispatched","mergeAuthorized",
  "deployAuthorized","signingAuthorized","productionAuthorization",
  "independentReviewVerified"])assert.equal(r[key],false,key);
}
test("verified handoff yields complete expiring owner decision packet, but never authority",()=>{
 const p=makeOwnerDecisionPacket(options());
 assert.equal(p.state,"awaiting_owner_decision");
 assert.equal(p.expiresAt-p.issuedAt,TTL_MS);
 assert.match(p.id,/^[a-f0-9]{64}$/);
 assert.equal(p.issueNumber,48);assert.equal(p.prNumber,49);
 assert.equal(p.attempt,1);invariant(p);
 const markdown=ownerReviewMarkdown(p);
 assert.match(markdown,/Approve review of one targeted correction/);
 assert.match(markdown,/separate, explicit authorization/);
 assert.match(markdown,/a{40}/);
 assert.doesNotMatch(markdown,/Bearer |token:|password:/i);
});
test("only exact authenticated owner intent is recorded; even approve never dispatches",()=>{
 const p=makeOwnerDecisionPacket(options());
 for(const decision of ["approve","reject"]){
  const r=recordOwnerDecision({packet:p,decision,actorId:OWNER,
   currentHandoff:verified(),repositoryId:REPO,now:1700000000001});
  assert.equal(r.ownerIntent,decision);
  assert.equal(r.state,decision==="approve"?"owner_intent_to_review":"owner_rejected");
  invariant(r);
 }
});
test("wrong actor, expired, wrong repository and invalid choices fail closed",()=>{
 const p=makeOwnerDecisionPacket(options());
 for(const overrides of [
  {actorId:OWNER+1},{repositoryId:REPO+1},{decision:"dispatch"},
  {now:p.expiresAt},{now:p.issuedAt-1}
 ]){
  const result=recordOwnerDecision({packet:p,decision:"approve",actorId:OWNER,
   currentHandoff:verified(),repositoryId:REPO,now:p.issuedAt+1,...overrides});
  assert.equal(result.state,"decision_blocked");invariant(result);
 }
});
test("changes to run, SHA, issue, PR or correction attempt invalidate owner intent",()=>{
 const p=makeOwnerDecisionPacket(options());
 for(const change of [
  x=>x.request.runId++,
  x=>x.request.headSha="b".repeat(40),
  x=>x.request.issueNumber++,
  x=>x.request.prNumber++,
  x=>x.request.attempt++
 ]){
  const fresh=structuredClone(verified());change(fresh);
  const result=recordOwnerDecision({packet:p,decision:"approve",actorId:OWNER,
   currentHandoff:fresh,repositoryId:REPO,now:p.issuedAt+1});
  assert.equal(result.state,"decision_blocked");invariant(result);
 }
});
test("missing verification, unsafe handoff, excessive TTL or malformed input never makes packet",()=>{
 for(const change of [
  x=>x.handoff.state="verification_required",
  x=>x.handoff.agentDispatchAuthorized=true,
  x=>x.ownerId=0,
  x=>x.repositoryId=0,
  x=>x.ttlMs=TTL_MS+1,
  x=>x.ttlMs=-1
 ]){
  const x=structuredClone(options());change(x);
  assert.equal(makeOwnerDecisionPacket(x),null);
 }
 assert.equal(ownerReviewMarkdown({}),null);
});
test("request identity is exact and expires; no simulated decision can act as a signed token",()=>{
 const x=options();const p=makeOwnerDecisionPacket(x);
 assert.equal(makeOwnerDecisionPacket(x).id,p.id);
 const altered={...p,id:"f".repeat(64)};
 const d=recordOwnerDecision({packet:altered,decision:"approve",actorId:OWNER,
  currentHandoff:verified(),repositoryId:REPO,now:p.issuedAt+1});
 assert.equal(d.state,"decision_blocked");invariant(d);
});
