"use strict";
/**
 * Read-only GitHub REST evidence collector. The injected client must be authenticated
 * and bound to the expected repository. This module never authorizes an action.
 * Each list response must expose total_count; missing/partial pagination fails closed.
 */
const positive=n=>Number.isSafeInteger(n)&&n>0;
const sha=s=>typeof s==="string"&&/^[a-f0-9]{40}$/.test(s);
const locked=reason=>Object.freeze({status:"no_go",verified:false,reason,
 operationalActivationAuthorized:false,agentDispatchAuthorized:false,
 dispatched:false,mergeAuthorized:false,deployAuthorized:false,
 signingAuthorized:false,productionAuthorization:false});
async function collectPages(fetchPage,{maxPages=20,maxItems=2000}={}){
 if(typeof fetchPage!=="function"||!positive(maxPages)||!positive(maxItems))throw Error("invalid_pagination");
 const items=[];let total=null;
 for(let page=1;page<=maxPages;page++){
  const response=await fetchPage(page,100);
  if(!response||!Number.isSafeInteger(response.total_count)||response.total_count<0||
   !Array.isArray(response.items)||response.items.length>100)throw Error("incomplete_page");
  if(total===null)total=response.total_count;
  if(response.total_count!==total||total>maxItems||items.length+response.items.length>maxItems)
   throw Error("pagination_count_changed_or_exceeded");
  items.push(...response.items);
  if(items.length===total)return items;
  if(response.items.length!==100)throw Error("premature_page_end");
 }
 throw Error("pagination_limit");
}
async function collectGithubProvenance(input={}){
 const {api,repositoryId,prNumber,headSha,workflowId,appId,requiredNames}=(input&&typeof input==='object'&&!Array.isArray(input))?input:{};
 if(!api||!positive(repositoryId)||!positive(prNumber)||!sha(headSha)||
 !positive(workflowId)||!positive(appId)||!Array.isArray(requiredNames)||
 !requiredNames.length||requiredNames.some(n=>typeof n!=="string"||!n.trim())||
 new Set(requiredNames).size!==requiredNames.length)return locked("invalid_trusted_configuration");
 try{
  const pr=await api.getPullRequest(prNumber);
  if(pr?.base?.repo?.id!==repositoryId||pr?.head?.repo?.id!==repositoryId||
   pr?.head?.sha!==headSha||pr?.number!==prNumber)return locked("pr_identity_changed");
  const checks=await collectPages((page,perPage)=>api.listCheckRuns(headSha,page,perPage));
  const runs=await collectPages((page,perPage)=>api.listWorkflowRuns(workflowId,page,perPage));
  const relevant=runs.filter(r=>r?.workflow_id===workflowId&&r?.head_sha===headSha&&
   r?.repository?.id===repositoryId&&r?.event==="pull_request"&&
   positive(r?.check_suite_id)&&positive(r?.run_attempt)&&positive(r?.id));
  if(relevant.length!==1)return locked("ambiguous_or_missing_workflow_run");
  const run=relevant[0];
  if(run.status!=="completed"||run.conclusion!=="success")return locked("workflow_not_successful");
  const matched=[];
  for(const name of requiredNames){
   const candidates=checks.filter(c=>c?.name===name);
   if(candidates.length!==1)return locked("missing_or_duplicate_required_check");
   const check=candidates[0];
   if(check.head_sha!==headSha||check.app?.id!==appId||
    check.check_suite?.id!==run.check_suite_id||
    check.status!=="completed"||check.conclusion!=="success")
    return locked("untrusted_or_failed_check");
   matched.push(Object.freeze({name:check.name,id:check.id,headSha:check.head_sha}));
  }
  // Evidence only: external trust and reviewer independence are not established.
  return Object.freeze({...locked("external_independent_attestation_required"),
   evidence:Object.freeze({repositoryId,prNumber,headSha,workflowId,
    workflowRunId:run.id,runAttempt:run.run_attempt,checkSuiteId:run.check_suite_id,
    checkNames:Object.freeze(matched.map(x=>x.name))})});
 }catch{return locked("authenticated_api_or_pagination_error");}
}
module.exports={collectPages,collectGithubProvenance};
