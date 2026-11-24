'use strict';
function createCorrectionAdmission({pool,scope,authenticate,credential}={}){
 if(typeof pool?.connect!=='function'||typeof authenticate!=='function'||!scope||typeof scope.product!=='string'||typeof scope.repository!=='string'||!/^[a-f0-9]{40}$/.test(scope.sha))throw Error('Invalid correction admission');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 return async function admit({taskId,initialDigest}={}){
  if(typeof taskId!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(taskId)||typeof initialDigest!=='string'||!/^[a-f0-9]{64}$/.test(initialDigest))return false;
  const actor=await authenticate(credential);
  if(!actor||actor.permission!=='queue.manage'||actor.role!==undefined||actor.product!==pinned.product||actor.repository!==pinned.repository||actor.sha!==pinned.sha||typeof actor.id!=='string'||!/^[A-Za-z0-9_.-]{1,80}$/.test(actor.id))return false;
  const client=await pool.connect();let discard=false;
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([pinned.product,pinned.repository])]);
   const result=await client.query(`INSERT INTO engineering_team_correction_cycles(task_id,initial_digest,actor_id)
 SELECT t.id,$5,$6 FROM engineering_team_tasks t WHERE t.id=$1 AND t.product=$2 AND t.repository=$3 AND t.head_sha=$4 AND t.state='succeeded' AND t.role IN ('backend-developer','frontend-developer')
 AND EXISTS(SELECT 1 FROM engineering_team_proposal_receipts r WHERE r.task_id=t.id)
 AND NOT EXISTS(SELECT 1 FROM engineering_team_stops s WHERE s.product=t.product AND s.repository=t.repository)
 AND NOT EXISTS(SELECT 1 FROM engineering_team_quarantine q WHERE q.product=t.product AND q.repository=t.repository AND q.role=t.role)
 ON CONFLICT DO NOTHING RETURNING task_id`,[taskId,pinned.product,pinned.repository,pinned.sha,initialDigest,actor.id]);
   await client.query('COMMIT');return result.rowCount===1;
  }catch(e){try{await client.query('ROLLBACK');}catch{discard=true;}throw e;}
  finally{client.release(discard);}
 };
}
module.exports={createCorrectionAdmission};
