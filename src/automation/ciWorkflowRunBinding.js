"use strict";
/**
 * Bind GitHub check runs to separately fetched authenticated Actions workflow
 * runs by check_suite_id. Never trust check-run names alone or nested
 * workflow_run objects supplied by untrusted callers.
 * Inputs must come from authenticated GitHub REST calls in the same repository.
 */
function bindChecksToWorkflowRuns({checks,workflowRuns,headSha,trustedWorkflowId}={}){
 if(!Array.isArray(checks)||!Array.isArray(workflowRuns)||
   !/^[a-f0-9]{40}$/.test(headSha||"")||
   !Number.isSafeInteger(trustedWorkflowId)||trustedWorkflowId<=0)return null;
 const suites=new Map();
 for(const run of workflowRuns){
   if(run?.workflow_id!==trustedWorkflowId||run.head_sha!==headSha||
      !Number.isSafeInteger(run.id)||run.id<=0||
      !Number.isSafeInteger(run.check_suite_id)||run.check_suite_id<=0||\n      !Number.isSafeInteger(run.run_attempt)||run.run_attempt<=0)continue;
   if(suites.has(run.check_suite_id))return null;
   suites.set(run.check_suite_id,run);
 }
 return checks.map(check=>{
   const run=suites.get(check?.check_suite?.id);
   return {...check,check_suite:{...check?.check_suite,
     workflow_run:run?{id:run.id,workflow_id:run.workflow_id,
       head_sha:run.head_sha,run_attempt:run.run_attempt}:null}};
 });
}
module.exports={bindChecksToWorkflowRuns};
