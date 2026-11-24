'use strict';
// Re-evaluates the existing safe queue policy at each new admission and claim.
// Completion is deliberately not gated so an in-flight lease can persist its
// receipt for reconciliation; this wrapper never grants execution authority.
function createPolicyBoundQueue({queue,policy,scope,issue,manifestDigest}={}){
 const methods=['enqueue','inspectWorkflowStep','claim','finish','stop','quarantine','expire','cancel'];
 if(!queue||methods.some(name=>typeof queue[name]!=='function')||typeof policy?.evaluate!=='function'||!scope||typeof scope.product!=='string'||typeof scope.repository!=='string'||typeof scope.sha!=='string'||!Number.isSafeInteger(issue)||issue<1||typeof manifestDigest!=='string'||!/^[a-f0-9]{64}$/.test(manifestDigest))throw Error('Invalid policy-bound queue');
 async function admit(){
  const decision=await policy.evaluate();
  if(!decision||decision.executionAuthorized!==false||decision.eligibleForPreparation!==true||decision.issueNumber!==issue||decision.manifestDigest!==manifestDigest||decision.scope?.product!==scope.product||decision.scope?.repository!==scope.repository||decision.scope?.sha!==scope.sha||typeof decision.evidenceSha256!=='string'||!/^[a-f0-9]{64}$/.test(decision.evidenceSha256))throw Error('Queue policy denied');
  return decision;
 }
 return Object.freeze({
  async enqueue(input){await admit();return queue.enqueue(input);},
  async inspectWorkflowStep(input){await admit();return queue.inspectWorkflowStep(input);},
  async claim(input){await admit();return queue.claim(input);},
  finish:input=>queue.finish(input),
  stop:input=>queue.stop(input),
  quarantine:input=>queue.quarantine(input),
  expire:input=>queue.expire(input),
  cancel:input=>queue.cancel(input),
  executionAllowed:()=>false
 });
}
module.exports={createPolicyBoundQueue};
