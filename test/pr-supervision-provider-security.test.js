"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {observe}=require("../.github/scripts/pr-supervision-observer");
const {ALLOWLIST_LABEL,LABELS}=require("../src/automation/safeQueuePolicy");
const sha="a".repeat(40);
function fixture(){
 const github={rest:{
  repos:{get:async()=>({data:{id:42}})},
  pulls:{get:async()=>({data:{number:21,state:"open",draft:false,
   head:{sha,repo:{id:42}},base:{repo:{id:42}}}})},
  issues:{get:async()=>({data:{number:20,state:"open",
   labels:[ALLOWLIST_LABEL,LABELS.eligible,LABELS.active].map(name=>({name}))}})},
  checks:{listForRef:async()=>({data:{total_count:2,check_runs:
   ["Node tests","PostgreSQL ledger integration"].map(name=>({
    name,head_sha:sha,status:"completed",conclusion:"success"}))}})}
 },graphql:async()=>({repository:{pullRequest:{number:21,
  closingIssuesReferences:{pageInfo:{hasNextPage:false},
  nodes:[{number:20,repository:{databaseId:42}}]}}}})};
 return github;
}
const base={owner:"acme",repo:"service",prNumber:21,issueNumber:20};
test("no authenticated providers never implies readiness",async()=>{
 const result=await observe({...base,github:fixture()});
 assert.notEqual(result.state,"ready_for_human_approval");
 assert.equal(result.mergeAuthorized,false);
});
test("review provider exception fails closed",async()=>{
 const result=await observe({...base,github:fixture(),
 trustedReviewProvider:async()=>{throw Error("provider offline");},
 trustedReviewerId:77});
 assert.notEqual(result.state,"ready_for_human_approval");
});
test("spoofed reviewer identity is rejected",async()=>{
 const result=await observe({...base,github:fixture(),trustedReviewerId:77,
 trustedReviewProvider:async()=>({authenticatedActorId:88,
 record:{prNumber:21,headSha:sha,reviewerId:77,status:"passed",findings:0}})});
 assert.notEqual(result.state,"ready_for_human_approval");
});
test("ledger failure is unknown, never fresh history",async()=>{
 const result=await observe({...base,github:fixture(),
 authenticatedLedgerClient:{query:async()=>{throw Error("database offline");}}});
 assert.notEqual(result.state,"ready_for_human_approval");
});
test("trusted review alone cannot bypass missing persistent history",async()=>{
 const result=await observe({...base,github:fixture(),trustedReviewerId:77,
 trustedReviewProvider:async()=>({authenticatedActorId:77,
 record:{prNumber:21,headSha:sha,reviewerId:77,status:"passed",findings:0}})});
 assert.notEqual(result.state,"ready_for_human_approval");
 assert.equal(result.mergeAuthorized,false);
});

test("observer refuses legacy provider without independent digest",async()=>{
 let calls=0;
 const result=await observe({...base,github:fixture(),trustedReviewerId:77,trustedReviewerPublicKey:"fixture",trustedReviewProvider:async()=>{calls++;return {};}});
 assert.equal(calls,0);assert.notEqual(result.state,"ready_for_human_approval");
});
test("invalid independent digest prevents review request",async()=>{
 let calls=0,digests=0;
 const result=await observe({...base,github:fixture(),trustedReviewerId:77,trustedReviewerPublicKey:"fixture",trustedKeyStatusProvider:async()=>"active",trustedEvidenceDigestProvider:async()=>{digests++;return "invalid";},trustedReviewProvider:async()=>{calls++;return {};}});
 assert.equal(digests,1);assert.equal(calls,0);assert.notEqual(result.state,"ready_for_human_approval");
});

test("revoked or unavailable reviewer key prevents provider call",async()=>{
 for(const status of ["revoked",null]){
 let calls=0;
 const result=await observe({...base,github:fixture(),trustedReviewerId:77,trustedReviewerPublicKey:"fixture",trustedEvidenceDigestProvider:async()=>"b".repeat(64),trustedKeyStatusProvider:async()=>status,trustedReviewProvider:async()=>{calls++;return {};}});
 assert.equal(calls,0);assert.notEqual(result.state,"ready_for_human_approval");
 }
});
test("key revoked during review is rechecked",async()=>{
 let checks=0,calls=0;
 const result=await observe({...base,github:fixture(),trustedReviewerId:77,trustedReviewerPublicKey:"fixture",trustedEvidenceDigestProvider:async()=>"b".repeat(64),trustedKeyStatusProvider:async()=>++checks===1?"active":"revoked",trustedReviewProvider:async()=>{calls++;return {};}});
 assert.equal(checks,2);assert.equal(calls,1);assert.notEqual(result.state,"ready_for_human_approval");
});

test("observer checks verified current failure recurrence before another correction",async()=>{
 const run={id:99,workflow_id:5503,head_sha:sha,check_suite_id:88,run_attempt:1,status:"completed",conclusion:"failure"};
 const checks=["Node tests","PostgreSQL ledger integration"].map((name,i)=>({id:100+i,name,head_sha:sha,status:"completed",conclusion:i?"success":"failure",app:{id:123},check_suite:{id:88}}));
 for(const scenario of ["equal","different","missing","invalid","error"]){
  const github=fixture();
  github.rest.checks.listForRef=async()=>({data:{total_count:checks.length,check_runs:checks}});
  github.rest.actions={listWorkflowRuns:async()=>({data:{total_count:1,workflow_runs:[run]}}),getWorkflowRun:async()=>({data:run})};
  github.request=async(route,args)=>{assert.match(route,/attempts/);assert.equal(args.attempt_number,1);return {data:{total_count:checks.length,jobs:checks.map(c=>({id:c.id+100,run_id:99,run_attempt:1,head_sha:sha,check_run_url:"https://api.github.com/repos/acme/service/check-runs/"+c.id,name:c.name,status:c.status,conclusion:c.conclusion}))}};};
  const client={query:async sql=>({rows:sql.includes("SELECT version")?[{version:1}]:sql.includes("SELECT sequence")?[{sequence:1,prior_head_sha:"b".repeat(40),resulting_head_sha:sha,failure_fingerprint:"ci:first-failure",event_id:"event-1",trusted_actor_id:123}]:[]})};
  let calls=0;
  const result=await observe({...base,github,authenticatedLedgerClient:client,trustedCiAppId:123,trustedCiWorkflowId:5503,...(scenario==="missing"?{}:{trustedFailureFingerprintProvider:async scope=>{calls++;assert.equal(scope.headSha,sha);assert.equal(scope.repositoryId,42);assert.equal(scope.checks[0].runAttempt,1);if(scenario==="error")throw Error("offline");return scenario==="equal"?"ci:first-failure":scenario==="different"?"ci:second-failure":"bad";}})});
  assert.equal(calls,scenario==="missing"?0:1);
  assert.equal(result.correction.allowed,scenario==="different",scenario);
  assert.equal(result.state,scenario==="different"?"ci_failed":"blocked",scenario);
  assert.equal(result.mergeAuthorized,false);
 }
});
