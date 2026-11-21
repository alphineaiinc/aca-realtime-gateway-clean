"use strict";
/**
 * Phase 2A staging-only correction evaluation.
 * No secrets, database connections or GitHub clients are constructed here.
 * The hosting service must inject authenticated read-only dependencies.
 */
const {timingSafeEqual}=require("node:crypto");
const {observeWithTrustedLedger}=require("./phase2aTrustedLedgerBridge");
const positive=n=>Number.isSafeInteger(n)&&n>0;
function bearerMatches(header,secret){
 if(typeof secret!=="string"||secret.length<24||
    typeof header!=="string"||!header.startsWith("Bearer "))return false;
 const given=Buffer.from(header.slice(7)),expected=Buffer.from(secret);
 return given.length===expected.length&&timingSafeEqual(given,expected);
}
async function evaluateStagingCorrection({authorization,request,config,github,pool}={}){
 const deny=(status,error)=>Object.freeze({status,body:{state:"blocked",error,
  agentDispatchAuthorized:false,mergeAuthorized:false,deployAuthorized:false}});
 if(!config?.enabled||!bearerMatches(authorization,config.bearerToken))
  return deny(401,"unauthorized");
 if(!request||!positive(request.runId)||
    Object.keys(request).length!==1||!positive(config.repositoryId)||
    !positive(config.workflowId)||!config.owner||!config.repo)
  return deny(400,"invalid_request");
 if(!github?.rest?.actions?.getWorkflowRun)
  return deny(503,"github_client_unavailable");
 if(!pool||typeof pool.connect!=="function")
  return deny(503,"ledger_client_unavailable");
 try{
  // Build the context exclusively from GitHub's authenticated run response.
  const {data:run}=await github.rest.actions.getWorkflowRun({
   owner:config.owner,repo:config.repo,run_id:request.runId
  });
  if(run?.id!==request.runId||run?.repository?.id!==config.repositoryId||
     run?.head_repository?.id!==config.repositoryId||
     run?.workflow_id!==config.workflowId||
     run?.name!=="ACA CI"||run?.status!=="completed")
    return deny(409,"unverified_ci_run");
  const event={action:"completed",repository:{id:config.repositoryId},workflow_run:run};
  const outcome=await observeWithTrustedLedger({
   pool,expectedDbRole:config.ledgerRole,github,owner:config.owner,repo:config.repo,
   event,expectedRepositoryId:config.repositoryId,
   expectedWorkflowId:config.workflowId
  });
  return Object.freeze({status:outcome.state==="request_owner_approval"?200:409,
    body:outcome});
 }catch{
  return deny(503,"trusted_evidence_unavailable");
 }
}
module.exports={evaluateStagingCorrection,bearerMatches};
