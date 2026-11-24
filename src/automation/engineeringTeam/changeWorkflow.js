'use strict';
const {prepareBranch}=require('./branchPreparation');
const {preparePublicationRequest}=require('./publicationRequest');
// Explicitly unmounted orchestration. Both transports must have separate
// durable admissions; never infer publication permission from branch creation.
function createChangeWorkflow({scope,branchTransport,draftTransport,authorize}={}){
 if(!scope||typeof branchTransport?.create!=='function'||typeof draftTransport?.publish!=='function'||typeof authorize!=='function')throw Error('Invalid change workflow');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 let consumed=false;
 return Object.freeze({async run({files,plan,verification,review}={}){
  const spec=prepareBranch({scope:pinned,files,plan});
  const request=preparePublicationRequest({plan,verification,review});
  if(request.patchDigest!==spec.patchDigest||consumed)throw Error('Workflow denied');
  // This check is additional to, not a replacement for, transport admissions.
  if(await authorize(Object.freeze({scope:pinned,action:'change.prepare',branchBinding:spec.binding,publicationEvidence:request.evidenceSha256}))!==true||consumed)throw Error('Workflow authorization denied');
  consumed=true;
  const branch=await branchTransport.create({files,plan});
  if(!branch||branch.branch!==spec.branch||branch.binding!==spec.binding||branch.releaseApproved!==false||typeof branch.headSha!=='string'||! /^[a-f0-9]{40}$/.test(branch.headSha))throw Error('Branch outcome requires reconciliation');
  // No retry or automatic branch cleanup after a successful creation.
  const pr=await draftTransport.publish({request,headBranch:branch.branch,headSha:branch.headSha});
  if(!pr||pr.draft!==true||pr.releaseApproved!==false||!Number.isSafeInteger(pr.number)||pr.number<1)throw Error('Publication outcome requires reconciliation');
  return Object.freeze({branch:branch.branch,headSha:branch.headSha,number:pr.number,patchDigest:spec.patchDigest,publicationBinding:pr.binding,releaseApproved:false});
 }});
}
module.exports={createChangeWorkflow};
