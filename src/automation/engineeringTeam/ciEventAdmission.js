'use strict';
// Offline receipt only. A receipt is not an execution grant.
function createCiEventAdmission({pool,scope,workflowId,authenticate,credential}={}){
 if(typeof pool?.connect!=='function'||typeof authenticate!=='function'||!scope||typeof scope.product!=='string'||typeof scope.repository!=='string'||!/^[a-f0-9]{40}$/.test(scope.sha)||!Number.isSafeInteger(workflowId)||workflowId<1)throw Error('Invalid admission configuration');
 const pinned=Object.freeze({...scope});
 return async function admit(event){
  if(!event||event.scope?.product!==pinned.product||event.scope?.repository!==pinned.repository||event.scope?.sha!==pinned.sha||event.workflowId!==workflowId||!Number.isSafeInteger(event.runId)||event.runId<1||!Number.isSafeInteger(event.attempt)||event.attempt<1||event.attempt>2147483647)return false;
  const actor=await authenticate(credential);
  if(!actor||actor.permission!=='queue.manage'||actor.product!==pinned.product||actor.repository!==pinned.repository||actor.sha!==pinned.sha||typeof actor.id!=='string'||!/^[A-Za-z0-9_.-]{1,80}$/.test(actor.id))return false;
  const client=await pool.connect();let discard=false;
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([pinned.product,pinned.repository])]);
   const stop=await client.query('SELECT EXISTS(SELECT 1 FROM engineering_team_stops WHERE product=$1 AND repository=$2) AS blocked',[pinned.product,pinned.repository]);
   let admitted=false;
   if(stop.rows[0]?.blocked===false){
    const receipt=await client.query('INSERT INTO engineering_team_ci_events(product,repository,head_sha,workflow_id,run_id,attempt,actor_id) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING run_id',[pinned.product,pinned.repository,pinned.sha,workflowId,event.runId,event.attempt,actor.id]);
    admitted=receipt.rowCount===1;
   }
   await client.query('COMMIT');return admitted;
  }catch(e){try{await client.query('ROLLBACK');}catch{discard=true;}throw e;}
  finally{client.release(discard);}
 };
}
module.exports={createCiEventAdmission};
