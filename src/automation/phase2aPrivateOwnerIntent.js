"use strict";
/**
 * Unmounted, private-side owner intent boundary.
 * Must be called only AFTER pinned proxy mTLS verification by the listener.
 * Never trusts owner identity, repository, CI state, or execution flags from
 * browser payload. No network or SQL clients created on import.
 */
const {verifyOwnerEdgeProof}=require("./phase2aOwnerEdgeProof");
const {persistOwnerIntent}=require("./phase2aOwnerDecisionStore");
const POS=n=>Number.isSafeInteger(n)&&n>0;
const flags=()=>({agentDispatchAuthorized:false,dispatched:false,
 mergeAuthorized:false,deployAuthorized:false,signingAuthorized:false,
 productionAuthorization:false});
const blocked=reason=>Object.freeze({state:"blocked",reason,...flags()});
async function handlePrivateOwnerIntent({body,expectedIssuer,expectedAudience,
 repositoryId,ownerId,publicKey,nonceStore,decisionClient,
 loadPendingPacket,loadFreshHandoff,now=Date.now()}={}){
 if(!body||Object.keys(body).sort().join(",")!=="decision,proof,requestId"||
   !["approve","reject"].includes(body.decision)||
   !/^[a-f0-9]{64}$/.test(body.requestId||"")||
   !POS(repositoryId)||!POS(ownerId)||!decisionClient?.query||
   typeof loadPendingPacket!=="function"||
   typeof loadFreshHandoff!=="function")
  return blocked("invalid_private_request");
 const verified=await verifyOwnerEdgeProof({proof:body.proof,publicKey,
  expectedIssuer,expectedAudience,expectedRepositoryId:repositoryId,
  expectedOwnerId:ownerId,expectedRequestId:body.requestId,
  expectedDecision:body.decision,nonceStore,now});
 if(verified.verified!==true)return blocked("untrusted_owner_proof");
 let packet,handoff;
 try{
  packet=await loadPendingPacket({requestId:verified.requestId,
   repositoryId,ownerId});
  if(!packet||packet.id!==verified.requestId||
    packet.ownerId!==verified.ownerId||packet.repositoryId!==repositoryId)
   return blocked("missing_trusted_packet");
  handoff=await loadFreshHandoff({repositoryId,runId:packet.runId});
 }catch{return blocked("trusted_evidence_unavailable");}
 if(handoff?.state!=="request_owner_approval")
  return blocked("not_eligible");
 const result=await persistOwnerIntent(decisionClient,{
  packet,decision:verified.decision,actorId:verified.ownerId,
  repositoryId,currentHandoff:handoff,now});
 return Object.freeze({...result,...flags()});
}
module.exports={handlePrivateOwnerIntent};
