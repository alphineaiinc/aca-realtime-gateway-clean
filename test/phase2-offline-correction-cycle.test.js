"use strict";

/**
 * Offline Phase 2 correction-loop simulation.
 * The "trusted_review" values below are SYNTHETIC UNIT-TEST FIXTURES:
 * they are never signed attestations or independent security approvals.
 * No network clients, credentials, GitHub writes, Codex dispatch, merge or deploy.
 */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {evaluatePrSupervision,STATES}=require("../src/automation/prSupervisionPolicy");
const {coordinateCorrection}=require("../src/automation/level2CorrectionCoordinator");

const REPO=1080201236, ISSUE=23, PR=27;
const HEADS=["a".repeat(40),"b".repeat(40),"c".repeat(40)];
const check=(headSha,conclusion="success")=>({
 name:"Node tests",headSha,status:"completed",conclusion
});
function fixture({headSha=HEADS[0],attempts=0,ci="success",review="passed",
 findings=0,unchangedFailureCount=0}={}) {
 return {
   repositoryId:REPO,
   issue:{number:ISSUE,state:"open",eligible:true},
   pr:{number:PR,issueNumber:ISSUE,state:"open",draft:false,headSha},
   trustedHead:true,trustedLink:true,
   ci:{headSha,requiredChecks:[check(headSha,ci)]},
   review:{headSha,status:review,findings,independent:true,source:"trusted_review"},
   correction:{attempts,unchangedFailureCount}
 };
}
function verdict(input) {
 const result=evaluatePrSupervision(input);
 const coordination=coordinateCorrection({evidence:input});
 assert.equal(result.mergeAuthorized,false);
 assert.equal(result.deployAuthorized,false);
 assert.equal(coordination.dispatched,false);
 assert.equal(coordination.mergeAuthorized,false);
 assert.equal(coordination.deployAuthorized,false);
 assert.equal(coordination.manualDispatchRequired,true);
 return {result,coordination};
}

test("synthetic two-correction cycle reaches advisory only after fresh current-head evidence",()=>{
 const events=[
  fixture({headSha:HEADS[0],ci:"failure"}),
  fixture({headSha:HEADS[1],attempts:1,review:"findings",findings:1}),
  fixture({headSha:HEADS[2],attempts:2}),
 ];
 const expected=[STATES.CI_FAILED,STATES.CORRECTION_NEEDED,STATES.READY];
 const report=events.map((event,index)=>{
   const {result,coordination}=verdict(event);
   assert.equal(result.state,expected[index]);
   assert.equal(Boolean(coordination.proposal),index<2);
   return {headSha:result.headSha,state:result.state,reasons:result.reasons,
           correctionsUsed:event.correction.attempts,
           humanApprovalOnly:result.mergeAuthorized===false};
 });
 assert.deepEqual(report.map(x=>x.correctionsUsed),[0,1,2]);
 assert.equal(report[2].humanApprovalOnly,true);
});

test("stale review after a corrected commit cannot carry approval forward",()=>{
 const input=fixture({headSha:HEADS[1],attempts:1});
 input.review.headSha=HEADS[0];
 const {result}=verdict(input);
 assert.equal(result.state,STATES.REVIEW_PENDING);
 assert.ok(result.reasons.includes("missing_trusted_current_head_review"));
});

test("stale or superseded CI cannot produce readiness",()=>{
 const input=fixture({headSha:HEADS[1]});
 input.ci.headSha=HEADS[0];
 assert.equal(verdict(input).result.state,STATES.CI_PENDING);
 input.ci.headSha=HEADS[1];
 input.ci.requiredChecks[0].headSha=HEADS[0];
 assert.equal(verdict(input).result.state,STATES.BLOCKED);
 input.ci.requiredChecks=[check(HEADS[1],"cancelled")];
 assert.equal(verdict(input).result.state,STATES.CI_PENDING);
});

test("third correction and unchanged repeated failure are escalated",()=>{
 const exhausted=fixture({attempts:2,ci:"failure"});
 assert.equal(verdict(exhausted).result.state,STATES.BLOCKED);
 assert.equal(verdict(exhausted).coordination.proposal,null);
 exhausted.correction.attempts=3;
 assert.ok(verdict(exhausted).result.reasons.includes("correction_budget_exceeded"));
 const repetition=fixture({attempts:1,ci:"failure",unchangedFailureCount:1});
 assert.equal(verdict(repetition).result.state,STATES.BLOCKED);
});

test("missing evidence, spoofed reviewer and duplicate checks fail closed",()=>{
 const noReview=fixture();
 delete noReview.review;
 assert.equal(verdict(noReview).result.state,STATES.REVIEW_PENDING);
 const spoofed=fixture();
 spoofed.review.source="pr_body";
 assert.equal(verdict(spoofed).result.state,STATES.REVIEW_PENDING);
 const duplicate=fixture();
 duplicate.ci.requiredChecks.push(check(HEADS[0]));
 assert.equal(verdict(duplicate).result.state,STATES.BLOCKED);
 const offline=fixture();
 delete offline.correction;
 assert.equal(verdict(offline).result.state,STATES.BLOCKED);
});

test("unverified cross-repository association is blocked, not approved",()=>{
 const input=fixture();
 input.repositoryId=880002; // simulated other repo: trusted repository binding fails
 input.trustedLink=false;
 assert.equal(verdict(input).result.state,STATES.BLOCKED);
 input.trustedLink=true;
 input.pr.issueNumber=999;
 assert.equal(verdict(input).result.state,STATES.BLOCKED);
});

test("replayed identical failure never creates a dispatch or merge authorization",()=>{
 const event=fixture({ci:"failure"});
 const first=verdict(event);
 const replay=verdict(event);
 assert.deepEqual(replay.result,first.result);
 assert.deepEqual(replay.coordination,first.coordination);
 assert.equal(first.coordination.nextAction,"human_approval_required_before_any_agent_dispatch");
});
