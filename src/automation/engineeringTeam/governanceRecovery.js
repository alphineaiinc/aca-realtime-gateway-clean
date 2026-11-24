'use strict';
const {createHash}=require('node:crypto');
const {getRole}=require('./registry');
const validDigest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const validScope=s=>s&&typeof s.product==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(s.product)&&typeof s.repository==='string'&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.repository)&&s.repository.length<=200&&typeof s.sha==='string'&&/^[a-f0-9]{40}$/.test(s.sha);
function createGovernanceRecovery({pool,scope,authenticate}={}){
 if(typeof pool?.connect!=='function'||typeof authenticate!=='function'||!validScope(scope))throw Error('Invalid governance recovery');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 const params=[pinned.product,pinned.repository,pinned.sha];
 const recoveryOperations=Object.freeze(['clear-stop','clear-quarantine']);
 function evidence({action,role}={}){
  if(!recoveryOperations.includes(action)||(action==='clear-stop'&&role!==undefined)||(action==='clear-quarantine'&&(typeof role!=='string'||!getRole(role))))throw Error('Invalid recovery evidence');
  return createHash('sha256').update(JSON.stringify([pinned,action,role??null])).digest('hex');
 }
 async function recover({credential,approvalId,action,role,evidenceSha256}={}){
  if(!recoveryOperations.includes(action)||(action==='clear-stop'&&role!==undefined)||(action==='clear-quarantine'&&(typeof role!=='string'||!getRole(role)))||!validDigest(evidenceSha256)||evidenceSha256!==evidence({action,role})||typeof approvalId!=='string'||! /^[a-f0-9-]{36}$/.test(approvalId))throw Error('Recovery denied');
  const actor=await authenticate(credential);
  if(!actor||actor.permission!=='queue.manage'||actor.role!==undefined||actor.product!==pinned.product||actor.repository!==pinned.repository||actor.sha!==pinned.sha||typeof actor.id!=='string'||!/^[A-Za-z0-9_.-]{1,80}$/.test(actor.id))throw Error('Recovery identity denied');
  const actorId=actor.id;
  const client=await pool.connect();let discard=false;
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([pinned.product,pinned.repository])]);
   const fresh=await authenticate(credential);
   if(!fresh||fresh.id!==actorId||fresh.permission!=='queue.manage'||fresh.role!==undefined||fresh.product!==pinned.product||fresh.repository!==pinned.repository||fresh.sha!==pinned.sha)throw Error('Recovery identity denied');
   const approval=await client.query("SELECT id,binding,requested_by FROM engineering_team_approval_requests WHERE id=$1 AND product=$2 AND repository=$3 AND head_sha=$4 AND operation='queue.recover' AND evidence_sha256=$5 AND state='approved' AND expires_at>clock_timestamp() AND requested_by=$6 AND decided_by<>$6",[approvalId,...params,evidenceSha256,actorId]);
   if(approval.rowCount!==1)throw Error('Recovery approval denied');
   const expectedBinding=createHash('sha256').update(JSON.stringify([approvalId,...params,'queue.recover',evidenceSha256])).digest('hex');
   if(approval.rows[0].binding!==expectedBinding)throw Error('Recovery approval binding denied');
   const active=await client.query(`SELECT 1 FROM engineering_team_tasks WHERE product=$1 AND repository=$2 AND state='running' ${action==='clear-quarantine'?'AND role=$3':''} LIMIT 1`,action==='clear-quarantine'?[...params.slice(0,2),role]:params.slice(0,2));
   if(active.rowCount!==0)throw Error('Recovery blocked: active lease requires reconciliation');
   if(action==='clear-stop'){
    const unresolved=await client.query("SELECT 1 FROM engineering_team_provider_attempts a LEFT JOIN engineering_team_provider_outcomes o ON o.binding=a.binding WHERE a.product=$1 AND a.repository=$2 AND (o.binding IS NULL OR o.outcome<>'completed') LIMIT 1",params.slice(0,2));
    if(unresolved.rowCount!==0)throw Error('Recovery blocked: unresolved provider attempt');
   }
   const audit=await client.query("INSERT INTO engineering_team_governance_recoveries(approval_id,product,repository,head_sha,action,role,evidence_sha256,recovered_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING approval_id",[approvalId,...params,action,role??null,evidenceSha256,actorId]);
   if(audit.rowCount!==1)throw Error('Recovery approval already consumed');
   const removed=action==='clear-stop'
    ?await client.query('DELETE FROM engineering_team_stops WHERE product=$1 AND repository=$2',[...params.slice(0,2)])
    :await client.query('DELETE FROM engineering_team_quarantine WHERE product=$1 AND repository=$2 AND role=$3',[...params.slice(0,2),role]);
   if(removed.rowCount!==1)throw Error('Recovery target unavailable');
   await client.query('COMMIT');
   return Object.freeze({action,role:role??null,recovered:true,executionAuthorized:false});
  }catch(e){try{await client.query('ROLLBACK');}catch{discard=true;}throw e;}
  finally{client.release(discard);}
 }
 return Object.freeze({evidence,recover,executionAllowed:()=>false});
}
module.exports={createGovernanceRecovery};
