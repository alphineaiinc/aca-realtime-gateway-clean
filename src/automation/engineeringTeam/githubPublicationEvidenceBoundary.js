'use strict';
const {createHash,timingSafeEqual}=require('node:crypto');
const API='https://api.github.com';
function sha(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||!/^[a-f0-9]{64}$/.test(a)||!/^[a-f0-9]{64}$/.test(b))return false;return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
function validateScope(s){if(!s||typeof s.repository!=='string'||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.repository)||typeof s.baseBranch!=='string'||typeof s.headBranch!=='string'||typeof s.baseSha!=='string'||!/^[a-f0-9]{40}$/.test(s.baseSha)||typeof s.headSha!=='string'||!/^[a-f0-9]{40}$/.test(s.headSha)||typeof s.binding!=='string'||!/^[a-f0-9]{64}$/.test(s.binding))throw Error('Invalid publication evidence scope');}
async function readAll({fetchImpl,token,scope}){
 const [owner,repo]=scope.repository.split('/');
 const url=new URL(API+'/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo)+'/pulls');
 url.searchParams.set('state','all');url.searchParams.set('base',scope.baseBranch);url.searchParams.set('per_page','100');
 const response=await fetchImpl(url,{method:'GET',headers:{accept:'application/vnd.github+json',authorization:'Bearer '+token,'x-github-api-version':'2022-11-28'}});
 if(!response||response.status!==200)throw Error('GitHub publication evidence unavailable');
 const rows=await response.json();if(!Array.isArray(rows)||rows.length>=100)throw Error('GitHub publication evidence incomplete; pagination required');
 return rows.filter(p=>p?.base?.repo?.full_name===scope.repository&&p?.head?.repo?.full_name===scope.repository&&p?.base?.ref===scope.baseBranch&&p?.head?.ref===scope.headBranch);
}
// Two independently supplied read-only transports and token sources are required.
// This module performs GET requests only. It never creates, edits, merges or retries PRs.
function createGitHubPublicationEvidenceBoundary({collectFetch,verifyFetch,collectToken,verifyToken}={}){
 if(typeof collectFetch!=='function'||typeof verifyFetch!=='function'||typeof collectToken!=='function'||typeof verifyToken!=='function'||collectFetch===verifyFetch||collectToken===verifyToken)throw Error('Independent GitHub evidence transports required');
 return Object.freeze({
  async collect(scope){
   validateScope(scope);
   const token=await collectToken();if(typeof token!=='string'||token.length<20)throw Error('GitHub read credential unavailable');
   const rows=await readAll({fetchImpl:collectFetch,token,scope});
   const observation={binding:scope.binding,repository:scope.repository,baseBranch:scope.baseBranch,headBranch:scope.headBranch,baseSha:scope.baseSha,headSha:scope.headSha,requesterId:scope.requesterId,complete:true,observations:rows};
   return Object.freeze({...observation,collectorDigest:sha(observation)});
  },
  async verify(observation,scope){
   validateScope(scope);
   if(!observation||observation.binding!==scope.binding||observation.repository!==scope.repository||observation.baseSha!==scope.baseSha||observation.headSha!==scope.headSha||observation.requesterId!==scope.requesterId||observation.complete!==true||!Array.isArray(observation.observations)||!safeEqual(observation.collectorDigest,sha({...observation,collectorDigest:undefined})))return false;
   const token=await verifyToken();if(typeof token!=='string'||token.length<20)return false;
   const rows=await readAll({fetchImpl:verifyFetch,token,scope});
   return safeEqual(sha(rows),sha(observation.observations));
  }
 });
}
module.exports={createGitHubPublicationEvidenceBoundary};
