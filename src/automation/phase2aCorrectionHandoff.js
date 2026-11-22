"use strict";
/**
 * Phase 2A human handoff. A completed CI event is NOT proof of an eligible
 * PR, trusted issue link, or correction budget. Never produce a dispatch
 * authorization based on CI alone. No network calls or side effects.
 */
const {triageCompletedCi}=require("./phase2aCiTriage");
const SHA=/^[a-f0-9]{40}$/;
function createCorrectionHandoff({event,expectedRepositoryId,expectedWorkflowId,
  pr,verifiedIssueLink=false,history}={}) {
  const ci=triageCompletedCi({event,expectedRepositoryId,expectedWorkflowId});
  const run=event?.workflow_run;
  const prValid=ci.state==="failed"&&pr?.state==="open"&&pr?.draft===false&&
    Number.isSafeInteger(pr.number)&&pr.number>0&&
    pr.headSha===ci.headSha&&SHA.test(pr.headSha||"")&&
    pr.repositoryId===expectedRepositoryId&&
    pr.baseRepositoryId===expectedRepositoryId&&verifiedIssueLink===true;
  const knownHistory=Number.isSafeInteger(history?.attempts)&&history.attempts>=0&&
    Number.isSafeInteger(history?.unchangedFailureCount)&&history.unchangedFailureCount>=0&&
    history.headSha===ci.headSha&&history.repositoryId===expectedRepositoryId&&
    history.prNumber===pr?.number&&history.issueNumber===pr?.issueNumber;
  const allowed=prValid&&knownHistory&&history.attempts<2&&history.unchangedFailureCount===0;
  const state=ci.state!=="failed"?"not_applicable":!prValid||!knownHistory?"verification_required":
    allowed?"request_owner_approval":"manual_escalation";
  const request=allowed?Object.freeze({
    type:"manual_correction_approval_request",
    issueNumber:pr.issueNumber,prNumber:pr.number,headSha:ci.headSha,runId:ci.runId,
    attempt:history.attempts+1,maxAttempts:2,
    suggestedTask:"Review failing CI logs and authorize one targeted code-fix attempt.",
    untrustedCiUrl:typeof run?.html_url==="string"?run.html_url:null
  }):null;
  return Object.freeze({
    state,ciState:ci.state,request,
    note:state==="verification_required"?
      "Confirm same-repository non-draft PR, verified issue linkage and authenticated head-bound correction history first.":
      state==="manual_escalation"?"Correction attempts exhausted or repeated unchanged failure; owner investigation required.":
      state==="not_applicable"?"No failed, verified ACA CI run requiring correction.":
      "Manual owner approval is required before any agent action.",
    dispatched:false,agentDispatchAuthorized:false,mergeAuthorized:false,
    deployAuthorized:false,independentReviewVerified:false
  });
}
module.exports={createCorrectionHandoff};
