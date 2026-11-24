'use strict';
const {digest}=require('./patchPlanner');
const {createActivationManifest}=require('./activationManifest');
// Offline reservation only: no provider client, no execution grant.
function createProviderReservation({pool,manifest,policy,authenticate,ceilings}={}){
 if(typeof pool?.connect!=='function'||typeof policy?.evaluate!=='function'||typeof authenticate!=='function'||!ceilings)throw Error('Invalid provider reservation');
 const pinned=createActivationManifest(manifest);
 if(pinned.evidenceSha256!==manifest.evidenceSha256||manifest.executionAuthorized!==false)throw Error('Manifest denied');
 const scope=pinned.scope,model=pinned.models.orchestrator,amount=ceilings[model];
 if(!Number.isSafeInteger(amount)||amount<1||amount>pinned.limits.maxSpendMicrousd)throw Error('Invalid provider ceiling');
 async function evidence(){
  const p=await policy.evaluate();
  if(!p||p.eligibleForPreparation!==true||p.executionAuthorized!==false||p.manifestDigest!==pinned.evidenceSha256||p.issueNumber!==pinned.issue||p.scope?.product!==scope.product||p.scope?.repository!==scope.repository||p.scope?.sha!==scope.sha||p.decision!=='queued:none'||! /^[a-f0-9]{64}$/.test(p.evidenceSha256))throw Error('Policy denied');
  return digest(JSON.stringify([pinned.evidenceSha256,p.evidenceSha256,'orchestrator',model,amount,'single-call-offline-reservation']));
 }
 return Object.freeze({evidence,async reserve({credential,approvalId}={}){
  const actor=await authenticate(credential);
  if(!actor||actor.permission!=='queue.manage'||actor.role!==undefined||actor.product!==scope.product||actor.repository!==scope.repository||actor.sha!==scope.sha||typeof approvalId!=='string'||! /^[a-f0-9-]{36}$/.test(approvalId))throw Error('Reservation denied');
  const binding=await evidence();
  const client=await pool.connect();let discard=false;
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([scope.product,scope.repository])]);
   const result=await client.query(`INSERT INTO engineering_team_provider_attempts(binding,approval_id,product,repository,head_sha,budget_id,model,reserved_microusd)
 SELECT $1,a.id,a.product,a.repository,a.head_sha,$6,$7,$8 FROM engineering_team_approval_requests a
 WHERE a.id=$2 AND a.product=$3 AND a.repository=$4 AND a.head_sha=$5 AND a.operation='provider.activate' AND a.evidence_sha256=$1 AND a.state='approved' AND a.expires_at>clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM engineering_team_stops s WHERE s.product=a.product AND s.repository=a.repository)
 AND NOT EXISTS(SELECT 1 FROM engineering_team_quarantine q WHERE q.product=a.product AND q.repository=a.repository)
 ON CONFLICT DO NOTHING RETURNING binding`,[binding,approvalId,scope.product,scope.repository,scope.sha,pinned.budgetId,model,amount]);
   if(result.rowCount!==1)throw Error('Reservation denied');
   const budget=await client.query(`UPDATE engineering_team_spend_budgets SET reserved_calls=reserved_calls+1,reserved_microusd=reserved_microusd+$4
 WHERE product=$1 AND repository=$2 AND budget_id=$3 AND max_calls=$5 AND max_microusd=$6 AND reserved_calls<max_calls AND reserved_microusd+$4<=max_microusd RETURNING reserved_calls`,[scope.product,scope.repository,pinned.budgetId,amount,pinned.limits.maxCalls,pinned.limits.maxSpendMicrousd]);
   if(budget.rowCount!==1)throw Error('Spend budget denied');
   await client.query('COMMIT');
   return Object.freeze({binding,reserved:true,executionAuthorized:false});
  }catch(e){try{await client.query('ROLLBACK');}catch{discard=true;}throw e;}
  finally{client.release(discard);}
 }});
}
module.exports={createProviderReservation};
