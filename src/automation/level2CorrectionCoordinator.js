"use strict";
/**
 * Phase 2 Level-2 correction coordinator: constructs a bounded, human-
 * actionable recommendation. No dispatch, Github writes, merge, or deploy.
 * Never treats advisory scanning as independent approval.
 */
const {evaluatePrSupervision,MAX_CORRECTIONS}=require("./prSupervisionPolicy");
const SHA=/^[a-f0-9]{40}$/;
const positive=n=>Number.isSafeInteger(n)&&n>0;
const TASKS=Object.freeze({
 ci_failed:"inspect_failing_ci_logs_and_propose_targeted_fix",
 correction_needed:"address_verified_review_findings",
 ci_pending:"wait_for_current_head_ci",
 review_pending:"await_independent_security_review",
 ready_for_human_approval:"request_explicit_owner_decision"
});
function coordinateCorrection({evidence,reviewNotes=[],failureSummary=null}={}){
 const decision=evaluatePrSupervision(evidence);
 const correction=evidence?.correction;
 const scope={prNumber:decision.prNumber,headSha:decision.headSha};
 const historyValid=correction&&Number.isSafeInteger(correction.attempts)&&
   correction.attempts>=0&&correction.attempts<=MAX_CORRECTIONS&&
   Number.isSafeInteger(correction.unchangedFailureCount)&&
   correction.unchangedFailureCount>=0;
 const validNotes=Array.isArray(reviewNotes)&&reviewNotes.length<=20&&
   reviewNotes.every(v=>typeof v==="string"&&v.length<=600);
 const validSummary=failureSummary===null||(typeof failureSummary==="string"&&
   failureSummary.length<=1200);
 const scopeValid=positive(scope.prNumber)&&SHA.test(scope.headSha||"");
 const action=TASKS[decision.state]||"escalate_to_owner";
 // Untrusted notes are ONLY included as untrusted context, never instructions
 // authorizing execution or changes to protected state.
 const mayRecommend=historyValid&&scopeValid&&validNotes&&validSummary&&
   decision.correction.allowed===true&&
   ["ci_failed","correction_needed"].includes(decision.state);
 const proposal=mayRecommend?Object.freeze({
   kind:action,
   scope:Object.freeze(scope),
   attempt:correction.attempts+1,
   maxAttempts:MAX_CORRECTIONS,
   untrustedReviewNotes:Object.freeze([...reviewNotes]),
   untrustedFailureSummary:failureSummary
 }):null;
 return Object.freeze({
  state:decision.state,
  reasons:decision.reasons,
  proposal,
  nextAction:mayRecommend?"human_approval_required_before_any_agent_dispatch":action,
  // Signed independent review and owner authorization never originate here.
  independentReviewGranted:false,
  manualDispatchRequired:true,
  dispatched:false,
  mergeAuthorized:false,
  deployAuthorized:false
 });
}
module.exports={coordinateCorrection};
