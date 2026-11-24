'use strict';
const {createHash}=require('node:crypto');
const {validatePublicationRequest}=require('./publicationRequest');
function publicationBinding({evidenceSha256,repository,baseBranch,headBranch,headSha}={}){
 if(typeof evidenceSha256!=='string'||!/^[a-f0-9]{64}$/.test(evidenceSha256)||typeof repository!=='string'||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||typeof baseBranch!=='string'||!/^[A-Za-z0-9_-]+$/.test(baseBranch)||typeof headBranch!=='string'||!/^aca-agent-draft-[a-f0-9]{16}$/.test(headBranch)||headBranch===baseBranch||typeof headSha!=='string'||!/^[a-f0-9]{40}$/.test(headSha))throw Error('Invalid publication binding');
 return createHash('sha256').update(JSON.stringify([evidenceSha256,repository,baseBranch,headBranch,headSha])).digest('hex');
}

// Records a single-use reservation for offline verification only. This is NOT
// the live draft transport admit callback: it never returns true or grants writes.
function createPublicationReservation({pool,scope,authenticate}={}){
 if(!pool||typeof pool.connect!=='function'||typeof authenticate!=='function'||!scope||typeof scope.product!=='string'||typeof scope.repository!=='string'||! /^[a-f0-9]{40}$/.test(scope.sha))throw Error('Invalid publication reservation');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 return Object.freeze({async reserve({credential,approvalId,binding,evidenceSha256,baseBranch,headBranch,headSha,request}={}){
  try{if(validatePublicationRequest(request,pinned).evidenceSha256!==evidenceSha256)throw Error('Mismatch');if(publicationBinding({evidenceSha256,repository:pinned.repository,baseBranch,headBranch,headSha})!==binding)throw Error('Mismatch');}catch{throw Error('Reservation denied');}
  const actor=await authenticate(credential);
  if(!actor||actor.permission!=='queue.manage'||actor.role!==undefined||actor.product!==pinned.product||actor.repository!==pinned.repository||actor.sha!==pinned.sha||typeof actor.id!=='string'||!/^[A-Za-z0-9_.-]{1,80}$/.test(actor.id)||typeof approvalId!=='string'||! /^[a-f0-9-]{36}$/.test(approvalId)||typeof binding!=='string'||! /^[a-f0-9]{64}$/.test(binding))throw Error('Reservation denied');
  const actorId=actor.id;
  const client=await pool.connect();let discard=false;
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([pinned.product,pinned.repository])]);
   const fresh=await authenticate(credential);
   if(!fresh||fresh.id!==actorId||fresh.permission!=='queue.manage'||fresh.role!==undefined||fresh.product!==pinned.product||fresh.repository!==pinned.repository||fresh.sha!==pinned.sha)throw Error('Reservation denied');
   const result=await client.query(`INSERT INTO engineering_team_publication_attempts(binding,approval_id,product,repository,base_sha,reserved_by,request_evidence_sha256,base_branch,head_branch,head_sha)
 SELECT $1,a.id,a.product,a.repository,a.head_sha,$6,$7,$8,$9,$10 FROM engineering_team_approval_requests a
 WHERE a.id=$2 AND a.product=$3 AND a.repository=$4 AND a.head_sha=$5 AND a.operation='github.write'
 AND a.requested_by=$6 AND a.decided_by<>$6 AND a.evidence_sha256=$1 AND a.state='approved' AND a.expires_at>clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM engineering_team_stops s WHERE s.product=a.product AND s.repository=a.repository)
 AND NOT EXISTS(SELECT 1 FROM engineering_team_quarantine q WHERE q.product=a.product AND q.repository=a.repository)
 ON CONFLICT DO NOTHING RETURNING binding`,[binding,approvalId,pinned.product,pinned.repository,pinned.sha,actorId,evidenceSha256,baseBranch,headBranch,headSha]);
   if(result.rowCount!==1)throw Error('Reservation denied');
   await client.query('COMMIT');
   return Object.freeze({binding,reserved:true,executionAuthorized:false});
  }catch(e){try{await client.query('ROLLBACK');}catch{discard=true;}throw e;}
  finally{client.release(discard);}
 }});
}
module.exports={createPublicationReservation,publicationBinding};
