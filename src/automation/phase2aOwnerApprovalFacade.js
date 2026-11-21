"use strict";
/**
 * Unwired, non-executing owner approval facade. A trusted server must inject
 * a fresh authenticated handoff from GitHub/Neon, session storage and scoped
 * PostgreSQL writer. There is no HTTP route, automatic dispatch or signing.
 */
const {validateOwnerAction}=require("./phase2aOwnerSession");
const {persistOwnerIntent}=require("./phase2aOwnerDecisionStore");
const inert=()=>({agentDispatchAuthorized:false,dispatched:false,
 mergeAuthorized:false,deployAuthorized:false,signingAuthorized:false,
 productionAuthorization:false});
const blocked=reason=>Object.freeze({state:"blocked",reason,...inert()});
async function submitOwnerIntent({sessionStore,decisionClient,
 cookie,origin,expectedOrigin,csrfHeader,method,packet,decision,
 repositoryId,loadFreshHandoff,now=Date.now()}={}){
 if(!["approve","reject"].includes(decision)||method!=="POST"||
    typeof loadFreshHandoff!=="function"||!decisionClient?.query)
  return blocked("invalid_request");
 const session=await validateOwnerAction({store:sessionStore,cookie,origin,
  expectedOrigin,csrfHeader,method,now});
 if(session.verified!==true)return blocked("owner_session_unverified");
 let handoff;
 try{
  // Never accept a handoff or owner ID from the browser's request body.
  handoff=await loadFreshHandoff({repositoryId,runId:packet?.runId});
 }catch{return blocked("trusted_handoff_unavailable");}
 if(handoff?.state!=="request_owner_approval")return blocked("not_eligible");
 const r=await persistOwnerIntent(decisionClient,{packet,decision,
  actorId:session.ownerId,currentHandoff:handoff,repositoryId,now});
 return Object.freeze({...r,...inert()});
}
module.exports={submitOwnerIntent};
