"use strict";
/**
 * Unmounted Phase 2A public-edge authority boundary.
 * No proof can be signed until the real server-side owner session, CSRF,
 * trusted stored request and live GitHub/ledger handoff have been verified.
 * The signing key is injected only by an isolated trusted staging process.
 * A proof is NOT an authorization to execute, merge, sign review or deploy.
 */
const {validateOwnerAction}=require("./phase2aOwnerSession");
const {recordOwnerDecision}=require("./phase2aOwnerDecision");
const {issueOwnerEdgeProof}=require("./phase2aOwnerEdgeProof");
const HASH=/^[a-f0-9]{64}$/;
const POS=n=>Number.isSafeInteger(n)&&n>0;
const flags=()=>({agentDispatchAuthorized:false,dispatched:false,
 mergeAuthorized:false,deployAuthorized:false,signingAuthorized:false,
 productionAuthorization:false});
const blocked=reason=>Object.freeze({state:"blocked",reason,...flags()});
async function prepareAuthenticatedEdgeIntent({
 sessionStore,cookie,origin,expectedOrigin,csrfHeader,method,
 requestId,decision,repositoryId,expectedOwnerId,
 issuer,audience,signingKey,loadPendingPacket,loadFreshHandoff,
 now=Date.now()
}={}){
 if(method!=="POST"||!HASH.test(requestId||"")||
    !["approve","reject"].includes(decision)||!POS(repositoryId)||
    !POS(expectedOwnerId)||typeof loadPendingPacket!=="function"||
    typeof loadFreshHandoff!=="function"||
    !Number.isSafeInteger(now)||now<0)
  return blocked("invalid_request");
 const session=await validateOwnerAction({store:sessionStore,cookie,
  origin,expectedOrigin,csrfHeader,method,now});
 if(session.verified!==true||session.ownerId!==expectedOwnerId)
  return blocked("owner_session_unverified");
 let packet,handoff;
 try{
  packet=await loadPendingPacket({requestId,repositoryId,
   ownerId:session.ownerId});
  if(!packet||packet.id!==requestId||
     packet.repositoryId!==repositoryId||
     packet.ownerId!==session.ownerId)
   return blocked("trusted_packet_missing");
  handoff=await loadFreshHandoff({repositoryId,runId:packet.runId});
 }catch{return blocked("trusted_evidence_unavailable");}
 const assessment=recordOwnerDecision({packet,decision,
  actorId:session.ownerId,currentHandoff:handoff,repositoryId,now});
 if(!["owner_intent_to_review","owner_rejected"].includes(assessment.state))
  return blocked("stale_or_ineligible");
 const proof=issueOwnerEdgeProof({
  issuer,audience,repositoryId,ownerId:session.ownerId,
  requestId,decision,privateKey:signingKey,now
 });
 if(!proof)return blocked("signing_unavailable");
 return Object.freeze({state:"ready_for_private_review",
  requestId,decision,body:Object.freeze({requestId,decision,proof}),
  ...flags()});
}
module.exports={prepareAuthenticatedEdgeIntent};
