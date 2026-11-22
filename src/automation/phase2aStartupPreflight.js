"use strict";
/**
 * Opt-in, read-only, one-shot startup attestation for isolated Phase 2A staging.
 * Never logs secrets, database rows, tokens or user-controlled CI data.
 * Never performs GitHub/DB writes or calls the correction dispatch path.
 */
const positive=x=>Number.isSafeInteger(x)&&x>0;
async function phase2aStartupPreflight({github,pool,owner,repo,
 repositoryId,workflowId,runId,prNumber,dbRole}={}){
 const failed=(stage)=>Object.freeze({status:"blocked",stage});
 if(!positive(repositoryId)||!positive(workflowId)||!positive(runId)||!positive(prNumber)||
    typeof owner!=="string"||typeof repo!=="string"||
    !/^[A-Za-z0-9_.-]+$/.test(owner)||!/^[A-Za-z0-9_.-]+$/.test(repo)||
    typeof dbRole!=="string"||!/^[a-z_][a-z0-9_]{0,62}$/.test(dbRole)||
    !github?.rest?.repos?.get||!github?.rest?.actions?.getWorkflowRun||
    !github?.rest?.pulls?.get||typeof github.graphql!=="function"||
    !pool||typeof pool.connect!=="function")
   return failed("configuration");
 try {
   const {data:repository}=await github.rest.repos.get({owner,repo});
   if(repository?.id!==repositoryId)return failed("github_repository");
   const {data:run}=await github.rest.actions.getWorkflowRun({
    owner,repo,run_id:runId
   });
   if(run?.id!==runId||run?.repository?.id!==repositoryId||
      run?.head_repository?.id!==repositoryId||
      run?.workflow_id!==workflowId||run?.name!=="ACA CI"||
      run?.status!=="completed")return failed("github_actions");
   const {data:pr}=await github.rest.pulls.get({owner,repo,pull_number:prNumber});
   if(pr?.number!==prNumber||pr?.head?.repo?.id!==repositoryId||
      pr?.base?.repo?.id!==repositoryId)return failed("github_pull_request");
   const response=await github.graphql(`query($owner:String!,$repo:String!,$pr:Int!) {
    repository(owner:$owner,name:$repo) { pullRequest(number:$pr) {
     number closingIssuesReferences(first:2) {
      pageInfo {hasNextPage}
      nodes {number repository {databaseId}}
     }
    }}
   }`,{owner,repo,pr:prNumber});
   if(response?.repository?.pullRequest?.number!==prNumber)
     return failed("github_graphql");
 }catch{return failed("github_api");}
 let client;
 try {
   client=await pool.connect();
   const identity=await client.query(
    "SELECT current_user AS db_role, pg_has_role(current_user, 'pg_read_all_data', 'member') AS broad_read"
   );
   if(identity?.rows?.length!==1||identity.rows[0].db_role!==dbRole||
      identity.rows[0].broad_read!==false)return failed("neon_identity");
   const p=await client.query(`SELECT
    has_table_privilege(current_user,'aca_automation.correction_ledgers','SELECT') AS read_ledgers,
    has_table_privilege(current_user,'aca_automation.correction_events','SELECT') AS read_events,
    has_table_privilege(current_user,'aca_automation.correction_ledgers','INSERT,UPDATE,DELETE') AS write_ledgers,
    has_table_privilege(current_user,'aca_automation.correction_events','INSERT,UPDATE,DELETE') AS write_events`);
   const grants=p?.rows?.[0];
   if(p?.rows?.length!==1||grants.read_ledgers!==true||
      grants.read_events!==true||grants.write_ledgers!==false||
      grants.write_events!==false)return failed("neon_privileges");
 }catch{return failed("neon_connection");}
 finally{try{client?.release();}catch{/* no secret logging */}}
 return Object.freeze({status:"verified",stage:"github_and_neon_readonly"});
}
module.exports={phase2aStartupPreflight};
