"use strict";
/**
 * Human decision protocol for a Phase 2A correction handoff.
 *
 * IMPORTANT: This is a pure, side-effect-free representation of the owner's
 * intent, NOT a Codex dispatch authorization. Caller must independently
 * authenticate the owner and independently verify the correction evidence.
 * No GitHub comments, issues, labels, SQL or external requests are made here.
 */
const {createHash,timingSafeEqual}=require("node:crypto");
const SHA=/^[a-f0-9]{40}$/;
const pos=n=>Number.isSafeInteger(n)&&n>0;
const safeInstant=n=>Number.isSafeInteger(n)&&n>=0;
const TTL_MS=30*60*1000;
function guardrails(){
 return Object.freeze({agentDispatchAuthorized:false,dispatched:false,
  mergeAuthorized:false,deployAuthorized:false,signingAuthorized:false,
  productionAuthorization:false,independentReviewVerified:false});
}
function binding(request,repositoryId){
 return [repositoryId,request.issueNumber,request.prNumber,
  request.headSha,request.runId,request.attempt,request.maxAttempts];
}
function validRequest(request,repositoryId){
 return request?.type==="manual_correction_approval_request"&&
  pos(repositoryId)&&pos(request.issueNumber)&&pos(request.prNumber)&&
  SHA.test(request.headSha||"")&&pos(request.runId)&&
  pos(request.attempt)&&request.attempt<=2&&request.maxAttempts===2;
}
function equalConstant(a,b){
 const x=Buffer.from(String(a)),y=Buffer.from(String(b));
 return x.length===y.length&&timingSafeEqual(x,y);
}
function makeOwnerDecisionPacket({handoff,repositoryId,ownerId,
 now=Date.now(),ttlMs=TTL_MS}={}){
 if(handoff?.state!=="request_owner_approval"||
    handoff?.dispatched!==false||
    handoff?.agentDispatchAuthorized!==false||
    handoff?.mergeAuthorized!==false||handoff?.deployAuthorized!==false||
    !validRequest(handoff.request,repositoryId)||!pos(ownerId)||
    !safeInstant(now)||!pos(ttlMs)||ttlMs>TTL_MS||
    !safeInstant(now+ttlMs))
  return null;
 const request=handoff.request;
 // Deterministic binding: a changed commit/run/attempt changes the ID.
 // It is an identifier, NOT a signature, bearer secret, or approval.
 const id=createHash("sha256").update(
  JSON.stringify(["aca-phase2a-owner-decision-v1",...binding(request,repositoryId)])
 ).digest("hex");
 return Object.freeze({
  version:"aca-phase2a-owner-decision-v1",type:"advisory_owner_decision",
  id,repositoryId,ownerId,issueNumber:request.issueNumber,
  prNumber:request.prNumber,headSha:request.headSha,runId:request.runId,
  attempt:request.attempt,maxAttempts:request.maxAttempts,
  issuedAt:now,expiresAt:now+ttlMs,
  state:"awaiting_owner_decision",
  instructions:"Owner may approve review of one targeted fix, or reject. Neither choice starts a coding agent.",
  ...guardrails()
 });
}
function recordOwnerDecision({packet,decision,actorId,currentHandoff,
 repositoryId,now=Date.now()}={}){
 const deny=(reason)=>Object.freeze({state:"decision_blocked",reason,
  ownerIntent:null,...guardrails()});
 if(!packet||packet.version!=="aca-phase2a-owner-decision-v1"||
    packet.type!=="advisory_owner_decision"||
    !pos(actorId)||!pos(repositoryId)||actorId!==packet.ownerId||
    repositoryId!==packet.repositoryId||
    !safeInstant(now)||!safeInstant(packet.issuedAt)||
    !safeInstant(packet.expiresAt)||packet.issuedAt>now||
    packet.expiresAt<=now||packet.expiresAt-packet.issuedAt>TTL_MS||
    !["approve","reject"].includes(decision))
  return deny("invalid_or_expired_owner_decision");
 if(currentHandoff?.state!=="request_owner_approval"||
    !validRequest(currentHandoff?.request,repositoryId)||
    currentHandoff?.agentDispatchAuthorized!==false||
    currentHandoff?.mergeAuthorized!==false||
    currentHandoff?.deployAuthorized!==false)
  return deny("fresh_evidence_required");
 const current=currentHandoff.request;
 if(!equalConstant(packet.id,createHash("sha256").update(
   JSON.stringify(["aca-phase2a-owner-decision-v1",...binding(current,repositoryId)])
  ).digest("hex"))||
    packet.issueNumber!==current.issueNumber||
    packet.prNumber!==current.prNumber||
    packet.headSha!==current.headSha||
    packet.runId!==current.runId||
    packet.attempt!==current.attempt||
    packet.maxAttempts!==current.maxAttempts)
  return deny("stale_or_mismatched_request");
 return Object.freeze({
  state:decision==="approve"?"owner_intent_to_review":"owner_rejected",
  reason:decision==="approve"?"separate_dispatch_authorization_required":"owner_declined",
  ownerIntent:decision,actorId,requestId:packet.id,
  repositoryId,issueNumber:packet.issueNumber,prNumber:packet.prNumber,
  headSha:packet.headSha,runId:packet.runId,attempt:packet.attempt,
  ...guardrails()
 });
}
function ownerReviewMarkdown(packet){
 if(!packet||packet.type!=="advisory_owner_decision"||
    !pos(packet.repositoryId)||!pos(packet.ownerId)||
    !SHA.test(packet.headSha||"")||!pos(packet.runId)||
    !pos(packet.issueNumber)||!pos(packet.prNumber)||
    !/^[a-f0-9]{64}$/.test(packet.id||""))
  return null;
 return [
  "### ACA Phase 2A — human correction decision (advisory only)",
  "",
  "- **Decision state:** Awaiting owner decision",
  "- **Repository ID:** "+packet.repositoryId,
  "- **Issue:** #"+packet.issueNumber,
  "- **Pull request:** #"+packet.prNumber,
  "- **Exact PR head:** `"+packet.headSha+"`",
  "- **Failed ACA CI run:** "+packet.runId,
  "- **Proposed attempt:** "+packet.attempt+" of "+packet.maxAttempts,
  "- **Owner GitHub user ID:** "+packet.ownerId,
  "- **Valid until (UTC):** "+new Date(packet.expiresAt).toISOString(),
  "- **Request ID (not a security token):** `"+packet.id+"`",
  "",
  "**Review choices:** Approve review of one targeted correction proposal, or reject.",
  "",
  "**Neither choice dispatches Codex, changes code, signs a review, merges a PR, or deploys services.**",
  "The live CI run, issue eligibility, current PR head and ledger must be reverified",
  "before recording owner intent. A separate, explicit authorization is mandatory",
  "before starting any native Codex task.",
 ].join("\n");
}
module.exports={makeOwnerDecisionPacket,recordOwnerDecision,ownerReviewMarkdown,TTL_MS};
