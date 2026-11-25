'use strict';
const {createHash,timingSafeEqual}=require('node:crypto');
const API='https://api.github.com';
const MAX_BYTES=2*1024*1024;
const validToken=t=>typeof t==='string'&&t.length>=20&&t.length<=4096&&!/[\s\x00-\x1f\x7f]/.test(t);
async function boundedRead(response){
 if(!response.body||typeof response.body.getReader!=='function')throw Error('GitHub publication evidence stream unavailable');
 const reader=response.body.getReader();const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw Error('GitHub publication evidence size limit');chunks.push(Buffer.from(value));}}finally{void reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function sha(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||!/^[a-f0-9]{64}$/.test(a)||!/^[a-f0-9]{64}$/.test(b))return false;return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
function validateScope(s){if(!s||typeof s.repository!=='string'||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.repository)||typeof s.baseBranch!=='string'||typeof s.headBranch!=='string'||typeof s.baseSha!=='string'||!/^[a-f0-9]{40}$/.test(s.baseSha)||typeof s.headSha!=='string'||!/^[a-f0-9]{40}$/.test(s.headSha)||typeof s.binding!=='string'||!/^[a-f0-9]{64}$/.test(s.binding))throw Error('Invalid publication evidence scope');}
async function readAll({fetchImpl,token,scope}){
 const [owner,repo]=scope.repository.split('/');
 const url=new URL(API+'/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo)+'/pulls');
 url.searchParams.set('state','all');url.searchParams.set('per_page','100');
 const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{accept:'application/vnd.github+json',authorization:'Bearer '+token,'x-github-api-version':'2022-11-28'}});
 if(!response||response.status!==200)throw Error('GitHub publication evidence unavailable');
 const rows=await boundedRead(response);if(!Array.isArray(rows)||rows.length>=100||/rel="next"/i.test(response.headers?.get('link')||''))throw Error('GitHub publication evidence incomplete; pagination required');
 if(rows.some(p=>!p||!Number.isSafeInteger(p.number)||p.number<1||!p.base||!p.head)||new Set(rows.map(p=>p.number)).size!==rows.length)throw Error('Malformed or duplicate publication evidence');
 // Preserve conflicting candidates rather than filtering them out by repository or base branch.
 return rows.filter(p=>p.head.ref===scope.headBranch||typeof p.body==='string'&&p.body.includes('Evidence binding: '+scope.binding));
}
// Two independently supplied read-only transports and token sources are required.
// This module performs GET requests only. It never creates, edits, merges or retries PRs.
function createGitHubPublicationEvidenceBoundary({collectFetch,verifyFetch,collectToken,verifyToken}={}){
 if(typeof collectFetch!=='function'||typeof verifyFetch!=='function'||typeof collectToken!=='function'||typeof verifyToken!=='function'||collectFetch===verifyFetch||collectToken===verifyToken)throw Error('Independent GitHub evidence transports required');
 return Object.freeze({
  async collect(scope){
   validateScope(scope);
   const [token,other]=await Promise.all([collectToken(),verifyToken()]);if(!validToken(token)||!validToken(other)||token===other)throw Error('Distinct GitHub read credentials required');
   const rows=await readAll({fetchImpl:collectFetch,token,scope});
   const observation={binding:scope.binding,repository:scope.repository,baseBranch:scope.baseBranch,headBranch:scope.headBranch,baseSha:scope.baseSha,headSha:scope.headSha,requesterId:scope.requesterId,complete:true,observations:rows};
   return Object.freeze({...observation,collectorDigest:sha(observation)});
  },
  async verify(observation,scope){
   validateScope(scope);
   if(!observation||observation.binding!==scope.binding||observation.repository!==scope.repository||observation.baseBranch!==scope.baseBranch||observation.headBranch!==scope.headBranch||observation.baseSha!==scope.baseSha||observation.headSha!==scope.headSha||observation.requesterId!==scope.requesterId||observation.complete!==true||!Array.isArray(observation.observations)||!safeEqual(observation.collectorDigest,sha({...observation,collectorDigest:undefined})))return false;
   const [token,other]=await Promise.all([verifyToken(),collectToken()]);if(!validToken(token)||!validToken(other)||token===other)return false;
   const rows=await readAll({fetchImpl:verifyFetch,token,scope});
   return safeEqual(sha(rows),sha(observation.observations));
  }
 });
}
module.exports={createGitHubPublicationEvidenceBoundary};
