'use strict';
// Re-evaluates policy for the configured immutable product/repository/revision.
// Caller-owned scope objects are never forwarded to the underlying queue.
function createPolicyBoundQueue({queue,policy,scope,issue,manifestDigest}={}){
 const methods=['enqueue','inspectWorkflowStep','claim','finish','stop','quarantine','expire','cancel'];
 if(!queue||methods.some(name=>typeof queue[name]!=='function')||typeof policy?.evaluate!=='function'||!scope||typeof scope.product!=='string'||typeof scope.repository!=='string'||typeof scope.sha!=='string'||!Number.isSafeInteger(issue)||issue<1||typeof manifestDigest!=='string'||!/^[a-f0-9]{64}$/.test(manifestDigest))throw Error('Invalid policy-bound queue');
 const pinnedScope=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 const scopeKey=s=>JSON.stringify([s?.product,s?.repository,s?.sha]);
 function scopedInput(input){
  if(!input||typeof input!=='object'||(input.scope!==undefined&&scopeKey(input.scope)!==scopeKey(pinnedScope)))throw Error('Queue scope denied');
  return {...input,scope:pinnedScope};
 }
 async function admit(){
  const decision=await policy.evaluate();
  if(!decision||decision.executionAuthorized!==false||decision.policyVersion!=='v1'||decision.eligibleForPreparation!==true||decision.issueNumber!==issue||decision.manifestDigest!==manifestDigest||scopeKey(decision.scope)!==scopeKey(pinnedScope)||typeof decision.evidenceSha256!=='string'||!/^[a-f0-9]{64}$/.test(decision.evidenceSha256))throw Error('Queue policy denied');
  return decision;
 }
 return Object.freeze({
  async enqueue(input){const safe=scopedInput(input);await admit();return queue.enqueue(safe);},
  async inspectWorkflowStep(input){const safe=scopedInput(input);await admit();return queue.inspectWorkflowStep(safe);},
  async claim(input){const safe=scopedInput(input);try{await admit();}catch{return null;}return queue.claim(safe);},
  finish:input=>queue.finish(scopedInput(input)),
  stop:input=>queue.stop(scopedInput(input)),
  quarantine:input=>queue.quarantine(scopedInput(input)),
  expire:input=>queue.expire(scopedInput(input)),
  cancel:input=>queue.cancel(scopedInput(input)),
  executionAllowed:()=>false
 });
}
module.exports={createPolicyBoundQueue};
