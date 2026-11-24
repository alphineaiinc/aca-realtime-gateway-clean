'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createGitHubPublicationEvidenceBoundary}=require('../src/automation/engineeringTeam/githubPublicationEvidenceBoundary');
const scope={binding:'a'.repeat(64),repository:'alphineaiinc/aca',baseBranch:'main',headBranch:'draft/sec-09',baseSha:'b'.repeat(40),headSha:'c'.repeat(40),requesterId:'manager-1'};
const pr={number:12,body:'Evidence binding: '+scope.binding,draft:true,state:'open',base:{repo:{full_name:scope.repository},ref:scope.baseBranch,sha:scope.baseSha},head:{repo:{full_name:scope.repository},ref:scope.headBranch,sha:scope.headSha}};
function response(rows,status=200){return {status,json:async()=>rows};}
test('collects and independently re-fetches exact PR evidence using separate read-only transports',async()=>{
 const calls=[];const collectFetch=async(url,options)=>{calls.push(['collect',options.method]);return response([pr]);};const verifyFetch=async(url,options)=>{calls.push(['verify',options.method]);return response([pr]);};
 const boundary=createGitHubPublicationEvidenceBoundary({collectFetch,verifyFetch,collectToken:async()=>'collector-token-long-enough',verifyToken:async()=>'verifier-token-long-enough'});
 const evidence=await boundary.collect(scope);assert.equal(evidence.observations.length,1);assert.equal(await boundary.verify(evidence,scope),true);assert.deepEqual(calls,[['collect','GET'],['verify','GET']]);
});
test('rejects a changed GitHub observation at independent verification',async()=>{
 const boundary=createGitHubPublicationEvidenceBoundary({collectFetch:async()=>response([pr]),verifyFetch:async()=>response([]),collectToken:async()=>'collector-token-long-enough',verifyToken:async()=>'verifier-token-long-enough'});
 const evidence=await boundary.collect(scope);assert.equal(await boundary.verify(evidence,scope),false);
});
test('rejects tampered digest, scope substitution and incomplete pagination',async()=>{
 const boundary=createGitHubPublicationEvidenceBoundary({collectFetch:async()=>response([pr]),verifyFetch:async()=>response([pr]),collectToken:async()=>'collector-token-long-enough',verifyToken:async()=>'verifier-token-long-enough'});
 const evidence=await boundary.collect(scope);assert.equal(await boundary.verify({...evidence,observations:[]},scope),false);assert.equal(await boundary.verify(evidence,{...scope,headSha:'d'.repeat(40)}),false);assert.equal(await boundary.verify(evidence,{...scope,baseBranch:'other'}),false);assert.equal(await boundary.verify(evidence,{...scope,headBranch:'other'}),false);
 const incomplete=createGitHubPublicationEvidenceBoundary({collectFetch:async()=>response(Array(100).fill(pr)),verifyFetch:async()=>response([pr]),collectToken:async()=>'collector-token-long-enough',verifyToken:async()=>'verifier-token-long-enough'});
 await assert.rejects(incomplete.collect(scope),/pagination required/);
});
test('requires distinct transport and token-provider functions',()=>{
 const fetcher=async()=>response([pr]),token=async()=>'collector-token-long-enough';
 assert.throws(()=>createGitHubPublicationEvidenceBoundary({collectFetch:fetcher,verifyFetch:fetcher,collectToken:token,verifyToken:async()=>'verifier-token-long-enough'}),/Independent GitHub evidence transports required/);
 assert.throws(()=>createGitHubPublicationEvidenceBoundary({collectFetch:fetcher,verifyFetch:async()=>response([pr]),collectToken:token,verifyToken:token}),/Independent GitHub evidence transports required/);
});
test('rejects non-200 GitHub responses without interpreting them as absence',async()=>{
 const boundary=createGitHubPublicationEvidenceBoundary({collectFetch:async()=>response([],403),verifyFetch:async()=>response([pr]),collectToken:async()=>'collector-token-long-enough',verifyToken:async()=>'verifier-token-long-enough'});
 await assert.rejects(boundary.collect(scope),/evidence unavailable/);
});
