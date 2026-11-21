"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {triageCompletedCi}=require("../src/automation/phase2aCiTriage");
const repoId=1080201236, workflowId=422174901, head="a".repeat(40);
function event(conclusion="failure"){
 return {action:"completed",repository:{id:repoId},
   workflow_run:{id:100,name:"ACA CI",workflow_id:workflowId,head_sha:head,status:"completed",
     conclusion,repository:{id:repoId},head_repository:{id:repoId}}};
}
function decide(e=event()){return triageCompletedCi({event:e,expectedRepositoryId:repoId,expectedWorkflowId:workflowId});}
test("real-shape failing CI recommends manual triage, no automated correction",()=>{
 const r=decide();
 assert.equal(r.state,"failed");assert.equal(r.action,"inspect_ci_failure_and_request_manual_correction");
 assert.equal(r.agentDispatchAuthorized,false);assert.equal(r.mergeAuthorized,false);
 assert.equal(r.independentReviewVerified,false);assert.equal(r.correctionAttemptsKnown,false);
});
test("successful CI still requires review and owner decision",()=>{
 const r=decide(event("success"));assert.equal(r.state,"passed");
 assert.equal(r.action,"await_review_and_owner_decision");assert.equal(r.mergeAuthorized,false);
});
test("cancelled, skipped and unknown conclusions never authorize anything",()=>{
 for(const state of ["cancelled","skipped",null,"neutral","action_required"]){
  const r=decide(event(state));assert.equal(r.state,"inconclusive");assert.equal(r.agentDispatchAuthorized,false);
 }
});
test("wrong repository including fork head, workflow, run state and SHA fail closed",()=>{
 const variants=[
  e=>e.repository.id=1,e=>e.workflow_run.repository.id=1,
  e=>e.workflow_run.head_repository.id=1,e=>e.workflow_run.workflow_id=1,
  e=>e.workflow_run.name="Fake ACA CI",e=>e.action="requested",
  e=>e.workflow_run.status="queued",e=>e.workflow_run.head_sha="bad",
  e=>e.workflow_run.id=0
 ];
 for(const mutate of variants){
  const e=event();mutate(e);
  const r=decide(e);assert.equal(r.state,"blocked");assert.equal(r.action,"stop_and_verify_workflow_provenance");
 }
});
test("missing event and untrusted expected identities fail closed",()=>{
 assert.equal(decide({}).state,"blocked");
 assert.equal(triageCompletedCi({event:event(),expectedRepositoryId:0,expectedWorkflowId:workflowId}).state,"blocked");
 assert.equal(triageCompletedCi({event:event(),expectedRepositoryId:repoId,expectedWorkflowId:0}).state,"blocked");
});
