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
