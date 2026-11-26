'use strict';
const {digest}=require('./patchPlanner');
// Simulates draft publication against injected fixture transport only.
// No live GitHub credentials, HTTP client, merge or deployment interface.
function createDraftPublicationSimulation({transport,authorize,scope}={}){
 if(!transport||typeof transport.readBase!=='function'||typeof transport.createDraft!=='function'||typeof authorize!=='function'||!scope||! /^[a-f0-9]{40}$/.test(scope.sha))throw Error('Invalid publication simulation');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 const attempted=new Set();let uncertain=false;
 return Object.freeze({async publish(request){
  if(uncertain)throw Error('Reconciliation required');
  if(!request||request.mode!=='draft-only'||request.operation!=='github.write'||request.executionAuthorized!==false||request.requiresIndependentAcceptance!==true||JSON.stringify(request.scope)!==JSON.stringify(pinned))throw Error('Publication request denied');
  const payload={scope:request.scope,operation:request.operation,mode:request.mode,patchDigest:request.patchDigest,testDigest:request.testDigest,reviewDigest:request.reviewDigest};
  if([payload.patchDigest,payload.testDigest,payload.reviewDigest].some(x=>typeof x!=='string'||! /^[a-f0-9]{64}$/.test(x))||digest(JSON.stringify(payload))!==request.evidenceSha256)throw Error('Evidence denied');
  const id=request.evidenceSha256;
  if(attempted.has(id)||attempted.size>=16)throw Error('Duplicate or exhausted publication');
  if(await authorize({scope:pinned,action:'publication.simulate',evidenceSha256:id})!==true)throw Error('Authorization denied');
  const base=await transport.readBase(pinned);
  if(base!==pinned.sha||uncertain||attempted.has(id)||attempted.size>=16)throw Error('Stale or duplicate publication');
  attempted.add(id);
  try{
   const result=await transport.createDraft(Object.freeze({scope:pinned,expectedBaseSha:pinned.sha,draft:true,evidenceSha256:id}));
   if(!result||result.draft!==true||result.repository!==pinned.repository||result.evidenceSha256!==id||!Number.isSafeInteger(result.number)||result.number<1)throw Error('Unknown publication outcome');
   return Object.freeze({number:result.number,draft:true,provenance:'simulation-only',releaseApproved:false});
  }catch{uncertain=true;throw Error('Reconciliation required');}
 }});
}
module.exports={createDraftPublicationSimulation};
