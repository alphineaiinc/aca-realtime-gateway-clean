'use strict';
const {getRole}=require('./registry');
const {createHash}=require('node:crypto');
const {validateProposal}=require('./contracts');
// Runs one offline proposal. No worker polling, network, or privileged tools.
function createQueueWorker({queue,manager,loadTask,fixtureProposalStorage=false}={}){
 if(!queue||typeof queue.claim!=='function'||typeof queue.finish!=='function'||!manager||typeof manager.createTask!=='function'||typeof manager.propose!=='function'||typeof loadTask!=='function')throw Error('Invalid worker configuration');
 return Object.freeze({async runOnce({scope,role,credential}){
  const def=getRole(role);
  const lease=await queue.claim({scope,role,credential});
  if(!lease)return Object.freeze({state:'idle'});
  const completion={scope,role,credential,taskId:lease.id,leaseId:lease.lease_id};
  let proposal;
  try{
   const input=await loadTask(Object.freeze({id:lease.id,scope:Object.freeze({...scope}),role}));
   if(!input||input.id!==lease.id||input.product!==scope.product||input.repository!==scope.repository||input.sha!==scope.sha||typeof input.subject!=='string')throw Error('Task binding denied');
   const task=manager.createTask({product:scope.product,repository:scope.repository,sha:scope.sha,subject:input.subject});
   proposal=await manager.propose({taskId:task.id,role,action:def.action});
   if(proposal.role!==role||proposal.approval!==false)throw Error('Proposal denied');
  }catch{
   const state=await queue.finish({...completion,outcome:'failed'});
   return Object.freeze({state,taskId:lease.id,releaseApproved:false});
  }
  // Only return proposal after current lease and governance are verified by queue.
  const fixtureProposal=fixtureProposalStorage===true?{role,output:validateProposal(role,proposal.output),approval:false}:undefined;
  const evidenceSha256=createHash('sha256').update(JSON.stringify(fixtureProposal??proposal)).digest('hex');
  const state=await queue.finish({...completion,outcome:'succeeded',evidenceSha256,...(fixtureProposal?{fixtureProposal}:{})});
  if(state!=='succeeded')throw Error('Completion denied');
  return Object.freeze({state,taskId:lease.id,proposal,evidenceSha256,releaseApproved:false});
 }});
}
module.exports={createQueueWorker};
