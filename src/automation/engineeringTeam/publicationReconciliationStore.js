'use strict';
const {createHash}=require('node:crypto');
const {reconcilePublication}=require('./publicationReconciliation');
function digest(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
// Offline only. Collector must authenticate GitHub observations independently.
// A stored observation never releases a reservation or authorizes a retry/write.
function createReconciliationStore({pool,authenticate,collect,verifyObservation,baseBranch,headBranch}={}){
 if(typeof pool?.connect!=='function'||typeof authenticate!=='function'||typeof collect!=='function'||typeof verifyObservation!=='function'||typeof baseBranch!=='string'||!baseBranch||typeof headBranch!=='string'||!headBranch)throw Error('Invalid reconciliation store');
 return Object.freeze({async record({credential,binding}={}){
  if(typeof binding!=='string'||!/^[a-f0-9]{64}$/.test(binding))throw Error('Invalid binding');
  const actor=await authenticate(credential);
  if(!actor||actor.permission!=='queue.manage'||actor.role!==undefined||typeof actor.id!=='string')throw Error('Reconciliation denied');
  const client=await pool.connect();let discard=false;
  try{
   await client.query('BEGIN');
   const reservation=await client.query(`SELECT p.binding,p.approval_id,p.product,p.repository,p.base_sha,p.reserved_by,a.requested_by,a.head_sha
    FROM engineering_team_publication_attempts p
    JOIN engineering_team_approval_requests a ON a.id=p.approval_id
    WHERE p.binding=$1 AND p.product=$2 AND p.repository=$3 AND p.reserved_by=$4
      AND a.requested_by=p.reserved_by AND a.product=p.product AND a.repository=p.repository
      AND a.operation='github.write' AND a.state='approved' AND a.binding=p.binding AND a.evidence_sha256=p.binding AND a.expires_at>clock_timestamp() AND a.decided_by<>a.requested_by
    FOR UPDATE OF p`,[binding,actor.product,actor.repository,actor.id]);
   if(reservation.rowCount!==1)throw Error('Reconciliation denied');
   const scope=reservation.rows[0];
   const fresh=await authenticate(credential);
   if(!fresh||fresh.id!==actor.id||fresh.permission!=='queue.manage'||fresh.role!==undefined||fresh.product!==scope.product||fresh.repository!==scope.repository||fresh.sha!==scope.base_sha)throw Error('Reconciliation denied');
   const prior=await client.query('SELECT state,pr_number FROM engineering_team_publication_reconciliation WHERE binding=$1',[binding]);
   if(prior.rowCount===1){
    await client.query('COMMIT');
    return Object.freeze({binding,state:prior.rows[0].state,number:prior.rows[0].pr_number,retryAuthorized:false,executionAuthorized:false,replayed:true});
   }
   const requestScope=Object.freeze({binding,product:scope.product,repository:scope.repository,baseSha:scope.base_sha,headSha:scope.head_sha,baseBranch,headBranch,requesterId:scope.requested_by,approvalId:scope.approval_id});
   const observation=await collect(requestScope);
   if(!observation||await verifyObservation(observation,requestScope)!==true)throw Error('Independent observation authentication failed');
   if(observation.repository!==scope.repository||observation.baseSha!==scope.base_sha||observation.headSha!==scope.head_sha||observation.binding!==binding||observation.requesterId!==scope.requested_by)throw Error('Independent observation scope mismatch');
   const result=reconcilePublication({...observation,binding,repository:scope.repository,baseSha:scope.base_sha,headSha:scope.head_sha});
   const observationSha256=digest({requestScope,observation});
   await client.query(`INSERT INTO engineering_team_publication_reconciliation
    (binding,product,repository,base_sha,head_sha,observed_by,state,pr_number,observation_sha256)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[binding,scope.product,scope.repository,scope.base_sha,scope.head_sha,actor.id,result.state,result.number,observationSha256]);
   await client.query('COMMIT');
   return Object.freeze({...result,replayed:false});
  }catch(e){try{await client.query('ROLLBACK');}catch{discard=true;}throw e;}
  finally{client.release(discard);}
 }});
}
module.exports={createReconciliationStore};
