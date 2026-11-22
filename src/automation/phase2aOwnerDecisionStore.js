"use strict";
/**
 * Persist owner intent in an externally authenticated, scoped STAGING client.
 * This module never authenticates a GitHub user by itself and never calls
 * Codex, merges, signs, or deploys. No connection or migration on import.
 */
const {makeOwnerDecisionPacket,recordOwnerDecision}=require("./phase2aOwnerDecision");
const pos=x=>Number.isSafeInteger(x)&&x>0;
const sha=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const inert=()=>Object.freeze({agentDispatchAuthorized:false,dispatched:false,
 mergeAuthorized:false,deployAuthorized:false,signingAuthorized:false,
 productionAuthorization:false});
function result(state,reason){return Object.freeze({state,reason,...inert()});}
function validPacket(x){return x&&sha(x.id)&&pos(x.repositoryId)&&
 pos(x.issueNumber)&&pos(x.prNumber)&&pos(x.runId)&&pos(x.ownerId)&&
 pos(x.attempt)&&/^[a-f0-9]{40}$/.test(x.headSha||"")&&
 Number.isSafeInteger(x.issuedAt)&&Number.isSafeInteger(x.expiresAt);}
async function transaction(client,fn){
 await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
 try{const value=await fn();await client.query("COMMIT");return value;}
 catch(err){try{await client.query("ROLLBACK");}catch{throw Error("decision_rollback_failed");}throw err;}
}
/**
 * Use only AFTER verifying current GitHub/Neon evidence and the authenticated
 * staging owner ID. The DB RLS/role configuration is an independent gate.
 */
async function createPendingDecision(client,{handoff,repositoryId,ownerId,now=Date.now()}={}){
 if(!client?.query)return result("blocked","missing_authenticated_client");
 const packet=makeOwnerDecisionPacket({handoff,repositoryId,ownerId,now});
 if(!packet)return result("blocked","unverified_request");
 try{return await transaction(client,async()=>{
  const row=await client.query(`INSERT INTO aca_automation.owner_decision_requests
   (request_id,repository_id,issue_number,pr_number,head_sha,run_id,
    attempt,owner_id,issued_at,expires_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9::double precision/1000),
     to_timestamp($10::double precision/1000))
   ON CONFLICT DO NOTHING RETURNING request_id`,[
   packet.id,packet.repositoryId,packet.issueNumber,packet.prNumber,
   packet.headSha,packet.runId,packet.attempt,packet.ownerId,
   packet.issuedAt,packet.expiresAt]);
  if(row.rows.length!==1)return result("blocked","duplicate_request");
  await client.query(`INSERT INTO aca_automation.owner_decision_events
    (request_id,event_type,actor_id) VALUES($1,'created',$2)`,[packet.id,ownerId]);
  return Object.freeze({state:"pending",packet,...inert()});
 });}catch{return result("blocked","trusted_storage_unavailable");}
}
/**
 * Owner identity and a fresh trusted handoff must be injected by an
 * authenticated caller. A request ID or GitHub comment is not authentication.
 * SQL UPDATE is conditional and atomic: only one decision can ever win.
 */
async function persistOwnerIntent(client,{packet,decision,actorId,currentHandoff,
 repositoryId,now=Date.now()}={}){
 if(!client?.query||!validPacket(packet)||!pos(actorId))
  return result("blocked","invalid_decision_request");
 const assessed=recordOwnerDecision({packet,decision,actorId,
  currentHandoff,repositoryId,now});
 if(assessed.state==="decision_blocked")return result("blocked",assessed.reason);
 const state=decision==="approve"?"approved_intent":"rejected";
 try{return await transaction(client,async()=>{
  const q=await client.query(`UPDATE aca_automation.owner_decision_requests SET
   state=$2,decided_at=to_timestamp($3::double precision/1000),decided_by=$4
   WHERE request_id=$1 AND repository_id=$5 AND issue_number=$6
   AND pr_number=$7 AND head_sha=$8 AND run_id=$9 AND attempt=$10
   AND owner_id=$4 AND state='pending'
   AND issued_at<=to_timestamp($3::double precision/1000)
   AND expires_at>to_timestamp($3::double precision/1000)
   RETURNING request_id`,[
   packet.id,state,now,actorId,repositoryId,packet.issueNumber,
   packet.prNumber,packet.headSha,packet.runId,packet.attempt]);
  if(q.rows.length!==1)return result("blocked","already_decided_or_expired");
  await client.query(`INSERT INTO aca_automation.owner_decision_events
   (request_id,event_type,actor_id,occurred_at)
   VALUES($1,$2,$3,to_timestamp($4::double precision/1000))`,[
    packet.id,state,actorId,now]);
  return Object.freeze({state:assessed.state,requestId:packet.id,
    ownerIntent:decision,...inert()});
 });}catch{return result("blocked","trusted_storage_unavailable");}
}
module.exports={createPendingDecision,persistOwnerIntent};
