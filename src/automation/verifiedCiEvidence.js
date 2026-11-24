"use strict";
/**
 * Rejects ambiguous CI checks and checks not issued by the pinned GitHub App.
 * The caller obtains check runs directly from authenticated GitHub API.
 */
function verifiedRequiredChecks({runs,totalCount,headSha,requiredNames,trustedAppId,trustedWorkflowId}={}){
 if(!Array.isArray(runs)||!Number.isSafeInteger(totalCount)||
 totalCount!==runs.length||!Array.isArray(requiredNames)||
 requiredNames.length===0||new Set(requiredNames).size!==requiredNames.length||
 !Number.isSafeInteger(trustedAppId)||trustedAppId<=0||
 !Number.isSafeInteger(trustedWorkflowId)||trustedWorkflowId<=0||
 typeof headSha!=="string"||!/^[a-f0-9]{40}$/.test(headSha))return null;
 const result=[];\n let commonRun=null,commonAttempt=null;
 for(const name of requiredNames){
   const matching=runs.filter(x=>x?.name===name);
   if(matching.length!==1)return null;
   const check=matching[0];
   if(check.head_sha!==headSha||check.app?.id!==trustedAppId||
     check.check_suite?.workflow_run?.workflow_id!==trustedWorkflowId||
     check.check_suite?.workflow_run?.head_sha!==headSha||
     !Number.isSafeInteger(check.check_suite?.workflow_run?.id)||
     check.check_suite.workflow_run.id<=0||
     typeof check.status!=="string"||
     (check.status==="completed"&&typeof check.conclusion!=="string"))
     return null;
   result.push({name:check.name,headSha:check.head_sha,
     status:check.status,conclusion:check.conclusion});
 }
 return result;
}
module.exports={verifiedRequiredChecks};
