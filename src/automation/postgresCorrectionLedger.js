"use strict";
/** Database adapter: caller must supply an authenticated, scoped pg client.
 * No database connection or migration is started by importing this module.
 * Transaction-level row locks serialize correction claims.
 */
const {MAX_CORRECTIONS}=require("./prSupervisionPolicy");
const SHA=/^[0-9a-f]{40}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function positive(n){return Number.isSafeInteger(n)&&n>0;}
function validate(x){
 if(!positive(x.repositoryId)||!positive(x.issueNumber)||!positive(x.prNumber)||
 !positive(x.actorId)||!UUID.test(x.eventId||"")||
 !SHA.test(x.priorHeadSha||"")||!SHA.test(x.resultingHeadSha||"")||
 x.priorHeadSha===x.resultingHeadSha||
 typeof x.failureFingerprint!=="string"||x.failureFingerprint.length<8||
 x.failureFingerprint.length>256) throw new Error("invalid_correction_claim");
}
async function appendCorrection(client,claim){
 validate(claim);
 if(!client||typeof client.query!=="function") throw new Error("missing_authenticated_db_client");
 const args=[claim.repositoryId,claim.issueNumber,claim.prNumber];
 await client.query("BEGIN");
 try {
   const locked=await client.query(`SELECT version FROM aca_automation.correction_ledgers
     WHERE repository_id=$1 AND issue_number=$2 AND pr_number=$3 FOR UPDATE`,args);
   if(locked.rows.length!==1) throw new Error("missing_ledger");
   const version=Number(locked.rows[0].version);
   if(!Number.isSafeInteger(version)||version<0||version>=MAX_CORRECTIONS)
     throw new Error("correction_budget_exhausted");
   const events=await client.query(`SELECT sequence,resulting_head_sha,failure_fingerprint
     FROM aca_automation.correction_events
     WHERE repository_id=$1 AND issue_number=$2 AND pr_number=$3
     ORDER BY sequence DESC LIMIT 1`,args);
   if(version!==0 && (events.rows.length!==1||Number(events.rows[0].sequence)!==version))
     throw new Error("corrupt_ledger");
   if(version===0 && events.rows.length!==0) throw new Error("corrupt_ledger");
   if(version>0 && (events.rows[0].resulting_head_sha!==claim.priorHeadSha||
     events.rows[0].failure_fingerprint===claim.failureFingerprint))
     throw new Error("stale_head_or_unchanged_failure");
   await client.query(`INSERT INTO aca_automation.correction_events
     (repository_id,issue_number,pr_number,sequence,event_id,prior_head_sha,
      resulting_head_sha,failure_fingerprint,trusted_actor_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[...args,version+1,
      claim.eventId,claim.priorHeadSha,claim.resultingHeadSha,
      claim.failureFingerprint,claim.actorId]);
   await client.query(`UPDATE aca_automation.correction_ledgers SET version=$4
     WHERE repository_id=$1 AND issue_number=$2 AND pr_number=$3`,[...args,version+1]);
   await client.query("COMMIT");
   return Object.freeze({attempts:version+1,remaining:MAX_CORRECTIONS-version-1});
 }catch(error){
   try{await client.query("ROLLBACK");}catch{throw new Error("correction_rollback_failed");}
   throw error;
 }
}
module.exports={appendCorrection};
