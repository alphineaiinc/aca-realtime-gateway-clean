'use strict';
// Re-evaluates the existing safe queue policy at each new admission and claim.
// Completion is deliberately not gated so an in-flight lease can persist its
// receipt for reconciliation; this wrapper never grants execution authority.
function createPolicyBoundQueue({queue,policy,scope,issue,manifestDigest}={}){
 const methods=['enqueue','inspectWorkflowStep','claim','finish','stop','quarantine','expire','cancel'];
 if(!queue||methods.some(name=>typeof queue[name]!=='function')||typeof policy?.evaluate!=='function'||!scope||typeof scope.product!=='string'||typeof scope.repository!=='string'||typeof scope.sha!=='string'||!Number.isSafeInteger(issue)||issue<1||typeof manifestDigest!=='string'||!/^[a-f0-9]{64}$/.test(manifestDigest))throw Error('Invalid policy-bound queue');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 const sameScope=value=>value&&value.product===pinned.product&&value.repository===pinned.repository&&value.sha===pinned.sha;
 function bindInput(input){
  if(!input||typeof input!=='object'||(input.scope!==undefined&&!sameScope(input.scope)))throw Error('Queue scope denied');
  return {...input,scope:pinned};
 }
 async function admit(){
  const decision=await policy.evaluate();
  if(!decision||decision.executionAuthorized!==false||decision.policyVersion!=='v1'||decision.eligibleForPreparation!==true||decision.issueNumber!==issue||decision.manifestDigest!==manifestDigest||!sameScope(decision.scope)||typeof decision.evidenceSha256!=='string'||!/^[a-f0-9]{64}$/.test(decision.evidenceSha256))throw Error('Queue policy denied');
  return decision;
 }
 return Object.freeze({
  async enqueue(input){const bound=bindInput(input);await admit();return queue.enqueue(bound);},
  async inspectWorkflowStep(input){const bound=bindInput(input);await admit();return queue.inspectWorkflowStep(bound);},
  async claim(input){const bound=bindInput(input);try{await admit();}catch{return null;}return queue.claim(bound);},
  finish:input=>queue.finish(bindInput(input)),
  stop:input=>queue.stop(bindInput(input)),
  quarantine:input=>queue.quarantine(bindInput(input)),
  expire:input=>queue.expire(bindInput(input)),
  cancel:input=>queue.cancel(bindInput(input)),
  executionAllowed:()=>false
 });
}
module.exports={createPolicyBoundQueue};
