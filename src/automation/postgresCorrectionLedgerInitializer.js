"use strict";
/**
 * Controlled ledger initialization. Only an externally authenticated service
 * may invoke this using an independently verified current PR head. The DB
 * client must be connected with the dedicated initializer role.
 * Never initialize as a side effect of append or read.
 */
const SHA=/^[a-f0-9]{40}$/;
const valid=n=>Number.isSafeInteger(n)&&n>0;
async function initializeCorrectionLedger(client,scope,{verifiedHeadSha,authenticatedInitializer}={}){
 if(!client||typeof client.query!=="function"||
 !valid(scope?.repositoryId)||!valid(scope?.issueNumber)||!valid(scope?.prNumber)||
 !SHA.test(verifiedHeadSha||"")||authenticatedInitializer!==true)
 throw new Error("unverified_ledger_initialization");
 const args=[scope.repositoryId,scope.issueNumber,scope.prNumber];
 await client.query("BEGIN");
 try{
   // Never reset or replace a previously initialized ledger.
   const inserted=await client.query(`INSERT INTO aca_automation.correction_ledgers
    (repository_id,issue_number,pr_number) VALUES ($1,$2,$3)
    ON CONFLICT DO NOTHING RETURNING version`,args);
   if(inserted.rows.length!==1||Number(inserted.rows[0].version)!==0)
     throw new Error("ledger_already_initialized");
   await client.query("COMMIT");
   return Object.freeze({initialized:true,verifiedHeadSha});
 }catch(error){
   try{await client.query("ROLLBACK");}catch{throw new Error("ledger_initialization_rollback_failed");}
   throw error;
 }
}
module.exports={initializeCorrectionLedger};
