"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createCorrectionHandoff}=require("../src/automation/phase2aCorrectionHandoff");
const repo=1080201236, workflow=422174901,sha="a".repeat(40);
function setup(){
 const event={action:"completed",repository:{id:repo},
 workflow_run:{id:551,status:"completed",name:"ACA CI",workflow_id:workflow,
 head_sha:sha,conclusion:"failure",repository:{id:repo},head_repository:{id:repo},
 html_url:"https://github.com/example/failed-ci"}};
 const pr={state:"open",draft:false,number:12,issueNumber:23,headSha:sha,
 repositoryId:repo,baseRepositoryId:repo};
 const history={attempts:0,unchangedFailureCount:0,headSha:sha,
 repositoryId:repo,prNumber:12,issueNumber:23};
 return {event,expectedRepositoryId:repo,expectedWorkflowId:workflow,pr,
 verifiedIssueLink:true,history};
}
test("verified CI failure and scoped ledger produce human-only correction request",()=>{
 const result=createCorrectionHandoff(setup());
 assert.equal(result.state,"request_owner_approval");
 assert.equal(result.request.attempt,1);
 assert.equal(result.request.maxAttempts,2);
 assert.equal(result.dispatched,false);
 assert.equal(result.agentDispatchAuthorized,false);
 assert.equal(result.mergeAuthorized,false);
 assert.equal(result.deployAuthorized,false);
 assert.equal(result.independentReviewVerified,false);
});
test("second correction is last; exhausted or unchanged failures escalate",()=>{
 const x=setup();x.history.attempts=1;
 assert.equal(createCorrectionHandoff(x).request.attempt,2);
 x.history.attempts=2;
 assert.equal(createCorrectionHandoff(x).state,"manual_escalation");
 x.history.attempts=1;x.history.unchangedFailureCount=1;
 assert.equal(createCorrectionHandoff(x).state,"manual_escalation");
});
test("event alone cannot create correction request",()=>{
 const x=setup();delete x.history;
 const r=createCorrectionHandoff(x);
 assert.equal(r.state,"verification_required");assert.equal(r.request,null);
});
test("draft, stale head, fork, wrong issue and unverified association blocked",()=>{
 for(const mutate of [
 x=>x.pr.draft=true,x=>x.pr.headSha="b".repeat(40),
 x=>x.pr.repositoryId=77,x=>x.pr.baseRepositoryId=77,
 x=>x.verifiedIssueLink=false,x=>x.history.issueNumber=90,
 x=>x.history.headSha="b".repeat(40),x=>x.history.repositoryId=77,
 x=>x.history.prNumber=99]){
  const x=setup();mutate(x);
  const r=createCorrectionHandoff(x);
  assert.equal(r.state,"verification_required");
  assert.equal(r.request,null);
 }
});
test("successful, cancelled, foreign-workflow CI never creates a request",()=>{
 for(const conclusion of ["success","cancelled","skipped"]){
  const x=setup();x.event.workflow_run.conclusion=conclusion;
  assert.equal(createCorrectionHandoff(x).state,"not_applicable");
 }
 const x=setup();x.event.workflow_run.workflow_id=1;
 assert.equal(createCorrectionHandoff(x).state,"not_applicable");
});
