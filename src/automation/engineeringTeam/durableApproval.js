'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {operations}=require('./approvalPolicy');
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(v);
const validDigest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const validScope=s=>s&&validId(s.product)&&typeof s.repository==='string'&&s.repository.length<=200&&/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s.repository)&&typeof s.sha==='string'&&/^[a-f0-9]{40}$/.test(s.sha);
const key=s=>JSON.stringify([s.product,s.repository,s.sha]);
function createDurableApprovalPolicy({pool,scopes,authenticate,ttlSeconds=900}={}){
 if(!pool||typeof pool.query!=='function'||typeof authenticate!=='function'||!Array.isArray(scopes)||!scopes.length||!scopes.every(validScope)||!Number.isSafeInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>900)throw Error('Invalid approval configuration');
 const allowed=new Set(scopes.map(key));
 function scopeParams(scope){if(!validScope(scope)||!allowed.has(key(scope)))throw Error('Scope denied');return [scope.product,scope.repository,scope.sha];}
 async function actorId(credential,scope,permission){
  const actor=await authenticate(credential);
  if(!actor||actor.permission!==permission||key(actor)!==key(scope)||!validId(actor.id)||actor.role!==undefined)throw Error('Identity denied');
  return actor.id;
 }
 return Object.freeze({
  async request({scope,operation,evidence,credential}){
   const params=scopeParams(scope);
   if(!operations.includes(operation)||!validDigest(evidence))throw Error('Invalid approval request');
   const actor=await actorId(credential,scope,'queue.manage');
   const id=randomUUID();
   const binding=createHash('sha256').update(JSON.stringify([id,...params,operation,evidence])).digest('hex');
   const result=await pool.query('INSERT INTO engineering_team_approval_requests(id,product,repository,head_sha,operation,evidence_sha256,binding,requested_by,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp()+make_interval(secs=>$9)) RETURNING id,binding,state,expires_at',[id,...params,operation,evidence,binding,actor,ttlSeconds]);
   if(result.rowCount!==1)throw Error('Approval request failed');
   return Object.freeze({...result.rows[0],executionAuthorized:false});
  },
  async recordDecision({scope,id,binding,credential,decision}){
   const params=scopeParams(scope);
   if(!validDigest(binding)||!['approved','denied'].includes(decision)||typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid decision');
   const actor=await actorId(credential,scope,'owner.approval');
   const result=await pool.query("UPDATE engineering_team_approval_requests SET state=$7,decided_by=$6,decided_at=clock_timestamp() WHERE product=$1 AND repository=$2 AND head_sha=$3 AND id=$4 AND binding=$5 AND requested_by<>$6 AND state='pending' AND expires_at>clock_timestamp() RETURNING id,state",[...params,id,binding,actor,decision]);
   if(result.rowCount!==1)throw Error('Decision denied');
   return Object.freeze({...result.rows[0],executionAuthorized:false});
  },
  executionAllowed(){return false;}
 });
}
module.exports={createDurableApprovalPolicy};
