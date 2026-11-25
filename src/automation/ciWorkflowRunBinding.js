"use strict";
/**
 * Bind GitHub check runs to separately fetched authenticated Actions workflow
 * runs by check_suite_id. Never trust check-run names alone or nested
 * workflow_run objects supplied by untrusted callers.
 * Inputs must come from authenticated GitHub REST calls in the same repository.
 */
function bindChecksToWorkflowRuns({checks,workflowRuns,attemptJobs,headSha,trustedWorkflowId}={}){
 if(!Array.isArray(checks)||!Array.isArray(workflowRuns)||!Array.isArray(attemptJobs)||
   !/^[a-f0-9]{40}$/.test(headSha||"")||
   !Number.isSafeInteger(trustedWorkflowId)||trustedWorkflowId<=0)return null;
 const suites=new Map();
 for(const run of workflowRuns){
   if(run?.workflow_id!==trustedWorkflowId||run.head_sha!==headSha||
      !Number.isSafeInteger(run.id)||run.id<=0||
      !Number.isSafeInteger(run.check_suite_id)||run.check_suite_id<=0||
      !Number.isSafeInteger(run.run_attempt)||run.run_attempt<=0||run.status!=="completed")continue;
   if(suites.has(run.check_suite_id))return null;
   suites.set(run.check_suite_id,run);
 }
 return checks.map(check=>{
   const candidate=suites.get(check?.check_suite?.id);
   const job=candidate&&attemptJobs.filter(j=>j.run_id===candidate.id&&j.run_attempt===candidate.run_attempt&&j.head_sha===headSha&&Number.isSafeInteger(j.id)&&j.id>0&&j.check_run_url?.endsWith("/check-runs/"+check.id)&&Number.isSafeInteger(check.id)&&check.id>0&&j.name===check.name&&j.status===check.status&&j.conclusion===check.conclusion);
   const run=job?.length===1?candidate:null;
   return {...check,check_suite:{...check?.check_suite,
     workflow_run:run?{id:run.id,workflow_id:run.workflow_id,
       head_sha:run.head_sha,run_attempt:run.run_attempt}:null}};
 });
}
// Shared authenticated REST bridge. Require complete attempt-specific job evidence
// and re-read the run after jobs to reject a rerun that starts during the read.
async function fetchBoundChecks({github,owner,repo,checks,headSha,trustedWorkflowId}={}){
 if(!Number.isSafeInteger(trustedWorkflowId)||trustedWorkflowId<=0||!Array.isArray(checks)||!github?.rest?.actions?.listWorkflowRuns||!github?.rest?.actions?.getWorkflowRun||typeof github.request!=="function")return null;
 const args={owner,repo,workflow_id:trustedWorkflowId,head_sha:headSha,per_page:100};
 const {data}=await github.rest.actions.listWorkflowRuns(args);
 if(!Array.isArray(data?.workflow_runs)||data.total_count!==data.workflow_runs.length||data.total_count>100)return null;
 const attemptJobs=[];
 const suites=new Set(checks.map(c=>c?.check_suite?.id));
 for(const run of data.workflow_runs){
  if(!suites.has(run.check_suite_id)||run.workflow_id!==trustedWorkflowId||run.head_sha!==headSha||run.status!=="completed")continue;
  if(!Number.isSafeInteger(run.id)||run.id<=0||!Number.isSafeInteger(run.run_attempt)||run.run_attempt<=0)return null;
  const {data:jobs}=await github.request("GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs",{owner,repo,run_id:run.id,attempt_number:run.run_attempt,per_page:100,page:1});
  if(!Array.isArray(jobs?.jobs)||jobs.total_count!==jobs.jobs.length||jobs.total_count>100)return null;
  const {data:fresh}=await github.rest.actions.getWorkflowRun({owner,repo,run_id:run.id});
  if(!fresh||["id","workflow_id","head_sha","check_suite_id","run_attempt","status","conclusion"].some(k=>fresh[k]!==run[k]))return null;
  for(const job of jobs.jobs){
   if(job.run_id!==run.id||job.run_attempt!==run.run_attempt||job.head_sha!==headSha)return null;
   attemptJobs.push(job);
  }
 }
 return bindChecksToWorkflowRuns({checks,workflowRuns:data.workflow_runs,attemptJobs,headSha,trustedWorkflowId});
}
module.exports={bindChecksToWorkflowRuns,fetchBoundChecks};
