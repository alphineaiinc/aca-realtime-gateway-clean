"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {coordinateCorrection}=require("../src/automation/level2CorrectionCoordinator");
const head="a".repeat(40);
function evidence({attempts=0,unchangedFailureCount=0,ciConclusion="failure",draft=false,review=null}={}){
 return {issue:{number:41,state:"open",eligible:true},
   pr:{number:21,state:"open",headSha:head,draft,issueNumber:41},
   trustedHead:true,trustedLink:true,
   correction:{attempts,unchangedFailureCount},
   ci:{headSha:head,requiredChecks:[{name:"ACA CI",headSha:head,status:"completed",conclusion:ciConclusion}]},
   review};
}
test("failed verified CI proposes a single bounded corrective action but never dispatches",()=>{
 const result=coordinateCorrection({evidence:evidence(),failureSummary:"Unit test failed"});
 assert.equal(result.state,"ci_failed");
 assert.equal(result.proposal.kind,"inspect_failing_ci_logs_and_propose_targeted_fix");
 assert.equal(result.proposal.attempt,1);
 assert.equal(result.dispatched,false);
 assert.equal(result.mergeAuthorized,false);
 assert.equal(result.deployAuthorized,false);
 assert.equal(result.manualDispatchRequired,true);
 assert.equal(result.independentReviewGranted,false);
});
test("second attempt is final; exhaustion and repeated failure escalate without proposal",()=>{
 const second=coordinateCorrection({evidence:evidence({attempts:1})});
 assert.equal(second.proposal.attempt,2);
 for(const config of [{attempts:2},{unchangedFailureCount:1},{attempts:3}]){
   const result=coordinateCorrection({evidence:evidence(config)});
   assert.equal(result.proposal,null);
   assert.equal(result.nextAction,"escalate_to_owner");
 }
});
test("draft, missing authenticated link, or stale evidence never dispatch correction",()=>{
 const draft=coordinateCorrection({evidence:evidence({draft:true})});
 assert.equal(draft.state,"blocked");
 assert.equal(draft.proposal,null);
 const unverified=evidence();unverified.trustedLink=false;
 assert.equal(coordinateCorrection({evidence:unverified}).proposal,null);
 const stale=evidence();stale.ci.requiredChecks[0].headSha="b".repeat(40);
 assert.equal(coordinateCorrection({evidence:stale}).proposal,null);
});
test("verified review findings recommend correction, while advisory review cannot",()=>{
 const verified=evidence({ciConclusion:"success",review:{
   headSha:head,status:"findings",findings:2,independent:true,source:"trusted_review"
 }});
 const result=coordinateCorrection({evidence:verified,reviewNotes:["Investigate auth edge"]});
 assert.equal(result.state,"correction_needed");
 assert.equal(result.proposal.kind,"address_verified_review_findings");
 assert.deepEqual(result.proposal.untrustedReviewNotes,["Investigate auth edge"]);
 const advisory=evidence({ciConclusion:"success",review:{
   headSha:head,status:"passed",findings:0,independent:false,source:"advisory"
 }});
 const blocked=coordinateCorrection({evidence:advisory});
 assert.equal(blocked.state,"review_pending");
 assert.equal(blocked.proposal,null);
});
test("passing CI and verified review still require owner decision, not a merge",()=>{
 const approved=evidence({ciConclusion:"success",review:{
   headSha:head,status:"passed",findings:0,independent:true,source:"trusted_review"
 }});
 const result=coordinateCorrection({evidence:approved});
 assert.equal(result.state,"ready_for_human_approval");
 assert.equal(result.proposal,null);
 assert.equal(result.mergeAuthorized,false);
 assert.equal(result.nextAction,"request_explicit_owner_decision");
});
test("oversized or invalid untrusted notes deny correction proposals",()=>{
 const long=coordinateCorrection({evidence:evidence(),reviewNotes:["x".repeat(601)]});
 assert.equal(long.proposal,null);
 const malformed=coordinateCorrection({evidence:evidence(),failureSummary:{commands:["deploy"]}});
 assert.equal(malformed.proposal,null);
});
