'use strict';
const {digest}=require('./patchPlanner');
// Unmounted GitHub draft transport. Requires an independently authorized,
// durable single-use admission service. Never writes a branch or merges.
function createGitHubDraftTransport({token,repository,baseBranch,fetchImpl=globalThis.fetch,admit}={}){
 if(typeof token!=='string'||!token||/[\r\n]/.test(token)||typeof repository!=='string'||! /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repository)||typeof baseBranch!=='string'||! /^[A-Za-z0-9_-]+$/.test(baseBranch)||typeof fetchImpl!=='function'||typeof admit!=='function')throw Error('Invalid draft transport');
 const root='https://api.github.com/repos/'+repository;
 async function call(path,method,body,signal){
  signal?.throwIfAborted();
  const response=await fetchImpl(root+path,{method,redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok||!response.body)throw Error('GitHub request failed');
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144)throw Error('Response limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }
 return Object.freeze({async publish({request,headSha,headBranch,signal}={}){
  if(!request||request.scope?.repository!==repository||request.operation!=='github.write'||request.mode!=='draft-only'||request.executionAuthorized!==false||request.requiresIndependentAcceptance!==true||! /^[a-f0-9]{40}$/.test(request.scope.sha)||! /^[a-f0-9]{40}$/.test(headSha)||typeof headBranch!=='string'||! /^aca-agent-draft-[a-f0-9]{16}$/.test(headBranch)||headBranch===baseBranch)throw Error('Draft request denied');
  const payload={scope:request.scope,operation:request.operation,mode:request.mode,patchDigest:request.patchDigest,testDigest:request.testDigest,reviewDigest:request.reviewDigest};
  if([payload.patchDigest,payload.testDigest,payload.reviewDigest].some(x=>typeof x!=='string'||! /^[a-f0-9]{64}$/.test(x))||digest(JSON.stringify(payload))!==request.evidenceSha256)throw Error('Evidence denied');
  const binding=digest(JSON.stringify([request.evidenceSha256,repository,baseBranch,headBranch,headSha]));
  const base=await call('/git/ref/heads/'+baseBranch,'GET',undefined,signal);
  const head=await call('/git/ref/heads/'+headBranch,'GET',undefined,signal);
  if(base.object?.sha!==request.scope.sha||head.object?.sha!==headSha)throw Error('Revision denied');
  // The service must atomically consume an exact binding and enforce independent
  // acceptance and governance; no default implementation or live wiring exists.
  signal?.throwIfAborted();
  if(await admit(Object.freeze({binding,repository,baseBranch,headBranch,headSha,baseSha:request.scope.sha,evidenceSha256:request.evidenceSha256}))!==true)throw Error('Publication admission denied');
  // Admission may take time; recheck both refs before the irreversible POST.
  // GitHub does not offer atomic SHA-conditional PR creation; protected refs
  // and independent reconciliation remain mandatory before live enablement.
  const freshBase=await call('/git/ref/heads/'+baseBranch,'GET',undefined,signal);
  const freshHead=await call('/git/ref/heads/'+headBranch,'GET',undefined,signal);
  if(freshBase.object?.sha!==request.scope.sha||freshHead.object?.sha!==headSha)throw Error('Revision changed after admission; reconcile reservation');
  try{
   const pr=await call('/pulls','POST',{title:'Engineering draft '+binding.slice(0,16),body:'Evidence binding: '+binding,head:headBranch,base:baseBranch,draft:true,maintainer_can_modify:false},signal);
   if(pr.draft!==true||pr.base?.sha!==request.scope.sha||pr.head?.sha!==headSha||!Number.isSafeInteger(pr.number)||pr.number<1)throw Error('Unexpected publication result');
   return Object.freeze({number:pr.number,binding,draft:true,releaseApproved:false});
  }catch{throw Error('Publication outcome uncertain; reconcile before any retry');}
 }});
}
module.exports={createGitHubDraftTransport};
