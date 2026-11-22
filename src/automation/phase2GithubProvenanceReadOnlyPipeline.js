"use strict";
/**
 * Offline-capable composition of transport -> REST adapter -> evidence collector.
 * No merge, signing, deployment or agent execution capability is exposed.
 * Credential resolution is performed by caller's trusted secret manager.
 */
const {createGithubReadTransport}=require("./phase2GithubReadTransport");
const {createGithubProvenanceApi}=require("./phase2GithubRestReadOnlyAdapter");
const {collectGithubProvenance}=require("./phase2GithubProvenanceCollector");
const SHA=/^[a-f0-9]{40}$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const noGo=reason=>Object.freeze({status:"no_go",verified:false,reason,
 operationalActivationAuthorized:false,agentDispatchAuthorized:false,
 dispatched:false,mergeAuthorized:false,deployAuthorized:false,
 signingAuthorized:false,productionAuthorization:false});
async function runReadOnlyGithubProvenance(input={}){
 const x=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
 const {owner,repo,token,httpsModule,timeoutMs,maxBytes,repositoryId,prNumber,
 headSha,workflowId,appId,requiredNames}=x;
 if(!positive(repositoryId)||!positive(prNumber)||!positive(workflowId)||
 !positive(appId)||!SHA.test(headSha||"")||!Array.isArray(requiredNames)||
 !requiredNames.length)return noGo("invalid_trusted_configuration");
 try{
  const request=createGithubReadTransport({token,httpsModule,timeoutMs,maxBytes});
  const api=createGithubProvenanceApi({owner,repo,request});
  const evidence=await collectGithubProvenance({api,repositoryId,prNumber,
   headSha,workflowId,appId,requiredNames});
  if(!evidence.evidence)return noGo(evidence.reason||"provenance_not_established");
  // Recheck PR head after collecting paginated evidence; reject head drift.
  const latest=await api.getPullRequest(prNumber);
  if(latest?.number!==prNumber||latest?.head?.sha!==headSha||
   latest?.head?.repo?.id!==repositoryId||latest?.base?.repo?.id!==repositoryId)
   return noGo("pr_head_changed_during_collection");
  return Object.freeze({...noGo("external_independent_attestation_required"),
   evidence:evidence.evidence});
 }catch{return noGo("authenticated_transport_or_collection_error");}
}
module.exports={runReadOnlyGithubProvenance};
