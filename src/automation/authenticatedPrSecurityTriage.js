"use strict";
/**
 * Read-only GitHub evidence bridge for advisory PR security triage.
 * The caller supplies an independently authenticated GitHub client.
 * Never trusts repository / SHA / file lists from PR descriptions or prompts.
 * Refuses large, truncated, renamed-without-patch or changing PRs.
 * No review signing, GitHub writes, dispatch, merges or deployment.
 */
const {inspectPrPatches}=require("./prSecurityPatchTriage");
const sha=/^[a-f0-9]{40}$/;
const pos=n=>Number.isSafeInteger(n)&&n>0;
const denied=reason=>Object.freeze({status:"blocked",reason,findings:[],independent:false});
function exactPr(pr,repositoryId,prNumber,headSha){
 return pr?.number===prNumber&&pr?.state==="open"&&pr?.draft===false&&
   pr?.head?.sha===headSha&&pr?.head?.repo?.id===repositoryId&&
   pr?.base?.repo?.id===repositoryId&&
   Number.isSafeInteger(pr?.changed_files)&&pr.changed_files>0&&pr.changed_files<=100;
}
async function inspectAuthenticatedPr({github,owner,repo,repositoryId,prNumber,headSha}={}){
 if(!github?.rest?.repos?.get||!github?.rest?.pulls?.get||
    !github?.rest?.pulls?.listFiles||typeof owner!=="string"||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(owner)||
    typeof repo!=="string"||!/^[A-Za-z0-9_.-]{1,100}$/.test(repo)||
    !pos(repositoryId)||!pos(prNumber)||!sha.test(headSha||""))
   return denied("invalid_authenticated_triage_scope");
 try{
  const {data:repository}=await github.rest.repos.get({owner,repo});
  if(repository?.id!==repositoryId||repository?.full_name!==owner+"/"+repo)
   return denied("repository_identity_mismatch");
  const {data:before}=await github.rest.pulls.get({owner,repo,pull_number:prNumber});
  if(!exactPr(before,repositoryId,prNumber,headSha))
   return denied("stale_or_unsupported_pr");
  // Single complete file page only. Refuse >100 rather than relying on
  // pagination under changing repository state.
  const page=await github.rest.pulls.listFiles({
   owner,repo,pull_number:prNumber,per_page:100,page:1
  });
  const files=page?.data;
  if(!Array.isArray(files)||files.length!==before.changed_files||
     new Set(files.map(f=>f?.filename)).size!==files.length)
   return denied("incomplete_or_duplicate_file_evidence");
  const inspected=inspectPrPatches({repositoryId,prNumber,headSha,files});
  if(inspected.status==="blocked")return inspected;
  const {data:after}=await github.rest.pulls.get({owner,repo,pull_number:prNumber});
  if(!exactPr(after,repositoryId,prNumber,headSha)||
      after.changed_files!==before.changed_files||
      after.base.sha!==before.base.sha)
   return denied("pr_changed_during_triage");
  return inspected;
 }catch{
  return denied("authenticated_github_evidence_unavailable");
 }
}
module.exports={inspectAuthenticatedPr,exactPr};
