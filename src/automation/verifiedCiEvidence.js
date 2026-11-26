"use strict";
/**
 * Rejects ambiguous CI checks and checks not issued by the pinned GitHub App.
 * All required checks must belong to one authenticated workflow run attempt.
 */
function verifiedRequiredChecks({runs,totalCount,headSha,requiredNames,trustedAppId,trustedWorkflowId}={}){
 if(!Array.isArray(runs)||!Number.isSafeInteger(totalCount)||
 totalCount!==runs.length||!Array.isArray(requiredNames)||
 requiredNames.length===0||new Set(requiredNames).size!==requiredNames.length||
 !Number.isSafeInteger(trustedAppId)||trustedAppId<=0||
 !Number.isSafeInteger(trustedWorkflowId)||trustedWorkflowId<=0||
 typeof headSha!=="string"||!/^[a-f0-9]{40}$/.test(headSha))return null;
 const result=[];
 let commonRun=null,commonAttempt=null;
 for(const name of requiredNames){
   const matching=runs.filter(x=>x?.name===name);
   if(matching.length!==1)return null;
   const check=matching[0],run=check.check_suite?.workflow_run;
   if(check.head_sha!==headSha||check.app?.id!==trustedAppId||
     run?.workflow_id!==trustedWorkflowId||run?.head_sha!==headSha||
     !Number.isSafeInteger(run?.id)||run.id<=0||
     !Number.isSafeInteger(run?.run_attempt)||run.run_attempt<=0||
     typeof check.status!=="string"||
     (check.status==="completed"&&typeof check.conclusion!=="string"))
     return null;
   if(commonRun!==null&&(commonRun!==run.id||commonAttempt!==run.run_attempt))return null;
   commonRun=run.id;commonAttempt=run.run_attempt;
   result.push({name:check.name,headSha:check.head_sha,runId:run.id,
     runAttempt:run.run_attempt,status:check.status,conclusion:check.conclusion});
 }
 return result;
}
module.exports={verifiedRequiredChecks};
