"use strict";
/**
 * Level-2 read-only CI evidence bridge. The authenticated GitHub client is
 * injected by trusted infrastructure; user-submitted PR text is not evidence.
 * Does not create issues, comments, agent tasks, merges or deployments.
 */
const {verifiedRequiredChecks}=require("./verifiedCiEvidence");
const {fetchBoundChecks}=require("./ciWorkflowRunBinding");
const {coordinateCorrection}=require("./level2CorrectionCoordinator");
const denied=reason=>Object.freeze({
 status:"blocked",reason,proposal:null,dispatched:false,
 manualDispatchRequired:true,mergeAuthorized:false,deployAuthorized:false
});
const pos=n=>Number.isSafeInteger(n)&&n>0;
const SHA=/^[a-f0-9]{40}$/;
async function createLiveCiCorrectionPacket({github,owner,repo,repositoryId,prNumber,
 headSha,issue,correction,requiredNames,trustedAppId,trustedWorkflowId,
 trustedLink=false,review=null}={}){
 if(!github?.rest?.repos?.get||!github?.rest?.pulls?.get||
    !github?.rest?.checks?.listForRef||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(owner||"")||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(repo||"")||
    !pos(repositoryId)||!pos(prNumber)||!SHA.test(headSha||"")||
    !pos(issue?.number)||issue?.state!=="open"||issue?.eligible!==true||
    !Number.isSafeInteger(correction?.attempts)||correction.attempts<0||
    !Number.isSafeInteger(correction?.unchangedFailureCount)||
    correction.unchangedFailureCount<0||trustedLink!==true)
  return denied("invalid_or_unverified_ci_scope");
 try{
  const {data:repository}=await github.rest.repos.get({owner,repo});
  if(repository?.id!==repositoryId||repository?.full_name!==owner+"/"+repo)
   return denied("repository_identity_mismatch");
  const getPr=async()=>{
   const response=await github.rest.pulls.get({owner,repo,pull_number:prNumber});
   return response?.data;
  };
  const exact=pr=>pr?.number===prNumber&&pr?.state==="open"&&
   pr?.head?.sha===headSha&&pr?.head?.repo?.id===repositoryId&&
   pr?.base?.repo?.id===repositoryId;
  const before=await getPr();
  if(!exact(before))return denied("unverified_or_stale_pr_head");
  const response=await github.rest.checks.listForRef({
   owner,repo,ref:headSha,per_page:100,page:1
  });
  const list=response?.data;
  if(!Array.isArray(list?.check_runs)||!Number.isSafeInteger(list.total_count)||
     list.total_count!==list.check_runs.length||list.total_count>100)
   return denied("incomplete_ci_check_evidence");
  const bound=await fetchBoundChecks({github,owner,repo,checks:list.check_runs,headSha,trustedWorkflowId});
  const checks=verifiedRequiredChecks({runs:bound,
   totalCount:list.total_count,headSha,requiredNames,trustedAppId,trustedWorkflowId});
  if(!checks)return denied("unverified_ci_check_provenance");
  const after=await getPr();
  if(!exact(after)||after.base?.sha!==before.base?.sha||
     after.draft!==before.draft)
   return denied("pr_changed_during_ci_read");
  const result=coordinateCorrection({evidence:{
   issue,correction,review,trustedHead:true,trustedLink:true,
   pr:{number:prNumber,state:after.state,headSha,draft:after.draft,
      issueNumber:issue.number},
   ci:{headSha,requiredChecks:checks}
  }});
  return Object.freeze({status:"advisory",repositoryId,prNumber,headSha,
   ...result});
 }catch{
  return denied("authenticated_ci_evidence_unavailable");
 }
}
module.exports={createLiveCiCorrectionPacket};
