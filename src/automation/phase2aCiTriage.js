"use strict";

/**
 * Phase 2A: advisory triage for an authenticated GitHub Actions workflow_run.
 * Only evidence from the trusted GitHub event context can be supplied by the
 * caller. Never dispatch a coding agent, grant a review, merge, or deploy.
 */
const SHA=/^[a-f0-9]{40}$/;
const ACTIONS=Object.freeze({
  failed:"inspect_ci_failure_and_request_manual_correction",
  passed:"await_review_and_owner_decision",
  inconclusive:"inspect_ci_run_manually",
  blocked:"stop_and_verify_workflow_provenance"
});
function triageCompletedCi({event, expectedRepositoryId, expectedWorkflowId}={}) {
  const run=event?.workflow_run;
  const sameRepo=Number.isSafeInteger(expectedRepositoryId)&&expectedRepositoryId>0 &&
    event?.repository?.id===expectedRepositoryId &&
    run?.repository?.id===expectedRepositoryId &&
    run?.head_repository?.id===expectedRepositoryId;
  const trustedWorkflow=Number.isSafeInteger(expectedWorkflowId)&&expectedWorkflowId>0 &&
    run?.workflow_id===expectedWorkflowId &&
    run?.name==="ACA CI" &&
    event?.action==="completed" && run?.status==="completed";
  const sha=run?.head_sha;
  const validSha=typeof sha==="string"&&SHA.test(sha);
  const validRun=Number.isSafeInteger(run?.id)&&run.id>0;
  const result={runId:validRun?run.id:null,headSha:validSha?sha:null,
    state:"blocked",action:ACTIONS.blocked,
    reasons:["unverified_ci_event"],correctionAttemptsKnown:false,
    agentDispatchAuthorized:false,mergeAuthorized:false,deployAuthorized:false,
    independentReviewVerified:false};
  if(!sameRepo||!trustedWorkflow||!validSha||!validRun) return Object.freeze(result);
  if(run.conclusion==="failure"||run.conclusion==="timed_out")
    return Object.freeze({...result,state:"failed",action:ACTIONS.failed,reasons:["ci_failure_requires_human_triage"]});
  if(run.conclusion==="success")
    return Object.freeze({...result,state:"passed",action:ACTIONS.passed,reasons:["ci_passed_review_still_required"]});
  return Object.freeze({...result,state:"inconclusive",action:ACTIONS.inconclusive,reasons:["ci_not_successfully_completed"]});
}
module.exports={triageCompletedCi};
