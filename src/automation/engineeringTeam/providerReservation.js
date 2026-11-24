'use strict';
const {digest}=require('./patchPlanner');
const {createActivationManifest}=require('./activationManifest');
// Offline reservation only: no provider client, no execution grant.
function createProviderReservation({pool,manifest,policy,authenticate,ceilings,reviewVerifier,costEvidenceSha256,prepareRequest}={}){
 if(typeof pool?.connect!=='function'||typeof policy?.evaluate!=='function'||typeof authenticate!=='function'||!ceilings)throw Error('Invalid provider reservation');
 const pinned=createActivationManifest(manifest);
 if(pinned.evidenceSha256!==manifest.evidenceSha256||manifest.executionAuthorized!==false)throw Error('Manifest denied');
 const scope=pinned.scope,model=pinned.models.orchestrator,amount=Object.hasOwn(ceilings,model)?ceilings[model]:undefined;
 if(!Number.isSafeInteger(amount)||amount<1||amount>pinned.limits.maxSpendMicrousd)throw Error('Invalid provider ceiling');
 if(reviewVerifier!==undefined&&typeof reviewVerifier.verify!=='function')throw Error('Invalid review verifier');
 if(costEvidenceSha256!==undefined&&!/^[a-f0-9]{64}$/.test(costEvidenceSha256))throw Error('Invalid cost evidence');
 if(prepareRequest!==undefined&&typeof prepareRequest!=='function')throw Error('Invalid request preparation');
 async function evidence(reviewEnvelope,request){
  const prepared=prepareRequest===undefined?null:prepareRequest(request);
  if(prepareRequest!==undefined&&(!prepared||prepared.executionAuthorized!==false||prepared.model!==model||! /^[a-f0-9]{64}$/.test(prepared.evidenceSha256)))throw Error('Request evidence denied');
  const p=await policy.evaluate();
  if(!p||p.eligibleForPreparation!==true||p.executionAuthorized!==false||p.manifestDigest!==pinned.evidenceSha256||p.issueNumber!==pinned.issue||p.scope?.product!==scope.product||p.scope?.repository!==scope.repository||p.scope?.sha!==scope.sha||p.decision!=='queued:none'||! /^[a-f0-9]{64}$/.test(p.evidenceSha256))throw Error('Policy denied');
  let reviewDigest=null;
  if(reviewVerifier!==undefined){
   const review=await reviewVerifier.verify(reviewEnvelope);
   if(!review||review.manifestDigest!==pinned.evidenceSha256||review.executionAuthorized!==false||! /^[a-f0-9]{64}$/.test(review.evidenceSha256)||!Number.isSafeInteger(review.expiresAt)||review.expiresAt<=Math.floor(Date.now()/1000))throw Error('Independent review denied');
   reviewDigest=review.evidenceSha256;
  }
  return digest(JSON.stringify([pinned.evidenceSha256,p.evidenceSha256,'orchestrator',model,amount,'single-call-offline-reservation',reviewDigest,costEvidenceSha256??null,prepared?.evidenceSha256??null]));
 }
 return Object.freeze({evidence,async reserve({credential,approvalId,reviewEnvelope,request}={}){
  // Freeze caller-owned evidence before asynchronous identity and policy checks.
  reviewEnvelope=structuredClone(reviewEnvelope);
  request=structuredClone(request);
  const actor=await authenticate(credential);
  if(!actor||actor.permission!=='queue.manage'||actor.role!==undefined||actor.product!==scope.product||actor.repository!==scope.repository||actor.sha!==scope.sha||typeof approvalId!=='string'||! /^[a-f0-9-]{36}$/.test(approvalId))throw Error('Reservation denied');
  const actorId=actor.id;
  const binding=await evidence(reviewEnvelope,request);
  const client=await pool.connect();let discard=false;
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([scope.product,scope.repository])]);
   const freshActor=await authenticate(credential);
   if(!freshActor||freshActor.id!==actorId||freshActor.permission!=='queue.manage'||freshActor.role!==undefined||freshActor.product!==scope.product||freshActor.repository!==scope.repository||freshActor.sha!==scope.sha)throw Error('Reservation denied');
   if(await evidence(reviewEnvelope,request)!==binding)throw Error('Policy or review binding changed');
   if(reviewVerifier!==undefined){
    const fresh=await reviewVerifier.verify(reviewEnvelope);
    if(!fresh||fresh.manifestDigest!==pinned.evidenceSha256||fresh.executionAuthorized!==false||!Number.isSafeInteger(fresh.expiresAt)||fresh.expiresAt<=Math.floor(Date.now()/1000))throw Error('Independent review denied');
    // Rebind after lock acquisition to reject a changed review envelope.
    if(await evidence(reviewEnvelope,request)!==binding)throw Error('Review binding changed');
   }
   const unresolved=await client.query(`SELECT 1 FROM engineering_team_provider_attempts a LEFT JOIN engineering_team_provider_outcomes o ON o.binding=a.binding WHERE a.product=$1 AND a.repository=$2 AND (o.binding IS NULL OR o.outcome<>'completed') LIMIT 1`,[scope.product,scope.repository]);
   if(unresolved.rowCount!==0)throw Error('Reservation denied: unresolved provider attempt');
   const result=await client.query(`INSERT INTO engineering_team_provider_attempts(binding,approval_id,product,repository,head_sha,budget_id,model,reserved_microusd,cost_evidence_sha256)
 SELECT $1,a.id,a.product,a.repository,a.head_sha,$6,$7,$8,$9 FROM engineering_team_approval_requests a
 WHERE a.id=$2 AND a.product=$3 AND a.repository=$4 AND a.head_sha=$5 AND a.operation='provider.activate' AND a.evidence_sha256=$1 AND a.state='approved' AND a.expires_at>clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM engineering_team_stops s WHERE s.product=a.product AND s.repository=a.repository)
 AND NOT EXISTS(SELECT 1 FROM engineering_team_quarantine q WHERE q.product=a.product AND q.repository=a.repository)
 ON CONFLICT DO NOTHING RETURNING binding`,[binding,approvalId,scope.product,scope.repository,scope.sha,pinned.budgetId,model,amount,costEvidenceSha256??null]);
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
