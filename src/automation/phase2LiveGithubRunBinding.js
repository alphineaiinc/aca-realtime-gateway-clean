"use strict";
/** Reject partial GitHub workflow records. No action authorization is ever issued. */
const SHA=/^[a-f0-9]{40}$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
function verifyLiveGithubRunBinding({pr,run,jobs,expectedRepositoryId,expectedHeadSha,expectedWorkflowId,expectedAppId}={}){
 const missing=[];
 if(!positive(expectedRepositoryId)||!SHA.test(expectedHeadSha||"")||
 !positive(expectedWorkflowId)||!positive(expectedAppId))missing.push("trusted_configuration");
 if(pr?.base?.ref!=="main"||pr?.state!=="open"&&pr?.state!=="closed"||
 pr?.head?.sha!==expectedHeadSha||pr?.base?.repo?.id!==expectedRepositoryId||
 pr?.head?.repo?.id!==expectedRepositoryId)missing.push("authenticated_pr_identity");
 if(!positive(run?.id)||run?.workflow_id!==expectedWorkflowId||
 run?.head_sha!==expectedHeadSha||run?.repository?.id!==expectedRepositoryId||
 run?.event!=="pull_request"||!positive(run?.check_suite_id)||
 !positive(run?.run_attempt)||run?.status!=="completed"||run?.conclusion!=="success")
 missing.push("complete_workflow_provenance");
 if(!Array.isArray(jobs)||jobs.length===0||
 jobs.some(j=>!positive(j?.id)||j?.head_sha!==expectedHeadSha||
 j?.status!=="completed"||j?.conclusion!=="success"||
 j?.check_run?.app?.id!==expectedAppId))
 missing.push("pinned_app_and_job_provenance");
 return Object.freeze({status:"no_go",verified:false,
 missing:Object.freeze(missing),operationalActivationAuthorized:false,
 agentDispatchAuthorized:false,dispatched:false,mergeAuthorized:false,
 deployAuthorized:false,signingAuthorized:false,productionAuthorization:false});
}
module.exports={verifyLiveGithubRunBinding};
