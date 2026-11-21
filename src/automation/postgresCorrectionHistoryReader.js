"use strict";
/**
 * Read-only adapter for a separately authenticated and repository-scoped
 * PostgreSQL client. Caller MUST establish identity/authorization externally.
 * Absence of an initialized ledger is unknown, never zero attempts.
 */
const {MAX_CORRECTIONS}=require("./prSupervisionPolicy");
function positive(n){return Number.isSafeInteger(n)&&n>0;}
function sha(s){return typeof s==="string"&&/^[a-f0-9]{40}$/.test(s);}
function fingerprint(s){return typeof s==="string"&&s.length>=8&&s.length<=256;}
async function readCorrectionHistory(client,{repositoryId,issueNumber,prNumber}={}){
 if(!client||typeof client.query!=="function"||
    !positive(repositoryId)||!positive(issueNumber)||!positive(prNumber))
   throw new Error("invalid_ledger_read_arguments");
 const args=[repositoryId,issueNumber,prNumber];
 // One consistent snapshot; never interpret an absent row as a fresh ledger.
 await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
 try{
   const header=await client.query(`SELECT version FROM aca_automation.correction_ledgers
     WHERE repository_id=$1 AND issue_number=$2 AND pr_number=$3`,args);
   if(header.rows.length!==1) throw new Error("uninitialized_or_ambiguous_ledger");
   const version=Number(header.rows[0].version);
   if(!Number.isSafeInteger(version)||version<0||version>MAX_CORRECTIONS)
     throw new Error("invalid_ledger_version");
   const events=await client.query(`SELECT sequence,prior_head_sha,resulting_head_sha,
     failure_fingerprint,event_id,trusted_actor_id
     FROM aca_automation.correction_events
     WHERE repository_id=$1 AND issue_number=$2 AND pr_number=$3
     ORDER BY sequence ASC`,args);
   if(events.rows.length!==version) throw new Error("corrupt_ledger_history");
   let lastSha=null;
   const seenEvents=new Set();
   for(let i=0;i<events.rows.length;i++){
     const e=events.rows[i];
     if(Number(e.sequence)!==i+1||!sha(e.prior_head_sha)||
       !sha(e.resulting_head_sha)||e.prior_head_sha===e.resulting_head_sha||
       (lastSha!==null&&e.prior_head_sha!==lastSha)||
       !fingerprint(e.failure_fingerprint)||
       !positive(Number(e.trusted_actor_id))||
       typeof e.event_id!=="string"||seenEvents.has(e.event_id))
       throw new Error("corrupt_ledger_history");
     seenEvents.add(e.event_id);lastSha=e.resulting_head_sha;
   }
   await client.query("COMMIT");
   // A prior correction means unchanged-failure status cannot be determined\n   // from ledger history alone: the *current* failing CI fingerprint must be\n   // independently verified before permitting another correction. Conservatively\n   // escalate instead of silently treating unknown as changed.\n   return Object.freeze({attempts:version,unchangedFailureCount:version===0?0:1,
     lastResultingHeadSha:lastSha,
     lastFailureFingerprint:events.rows.at(-1)?.failure_fingerprint??null});
 }catch(error){
   try{await client.query("ROLLBACK");}catch{throw new Error("ledger_read_rollback_failed");}
   throw error;
 }
}
module.exports={readCorrectionHistory};
