'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {createGitHubDraftTransport}=require('../src/automation/engineeringTeam/githubDraftTransport');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const headSha='b'.repeat(40),headBranch='aca-agent-draft-1234567890abcdef';
const payload={scope,operation:'github.write',mode:'draft-only',patchDigest:'c'.repeat(64),testDigest:'d'.repeat(64),reviewDigest:'e'.repeat(64)};
const request={...payload,evidenceSha256:digest(JSON.stringify(payload)),executionAuthorized:false,requiresIndependentAcceptance:true};
const input={request,headSha,headBranch};
function fixture({allow=true,stale=false,fail=false}={}){
 const calls=[];const admissions=[];
 const transport=createGitHubDraftTransport({token:'fixture',repository:scope.repository,baseBranch:'main',admit:async x=>{admissions.push(x);return allow;},fetchImpl:async(url,options)=>{
 calls.push({url,method:options.method});
 assert.ok(url.startsWith('https://api.github.com/repos/fixture/aca/'));assert.equal(options.redirect,'error');
 if(options.method==='POST'){
  assert.equal(url,'https://api.github.com/repos/fixture/aca/pulls');
  const body=JSON.parse(options.body);assert.equal(body.draft,true);assert.equal(body.maintainer_can_modify,false);assert.equal(body.head,headBranch);assert.equal(body.base,'main');
  if(fail)throw Error('fixture timeout');
  return new Response(JSON.stringify({number:42,draft:true,base:{sha:scope.sha},head:{sha:headSha}}));
 }
 return new Response(JSON.stringify({object:{sha:url.endsWith('/main')?(stale?'f'.repeat(40):scope.sha):headSha}}));
 }});
 return {transport,calls,admissions};
}
test('draft transport checks both revisions and admits exact binding before POST',async()=>{
 const f=fixture();const result=await f.transport.publish(input);
 assert.equal(result.number,42);assert.equal(result.releaseApproved,false);
 assert.deepEqual(f.calls.map(x=>x.method),['GET','GET','POST']);
 assert.equal(result.binding,f.admissions[0].binding);
});
test('stale revisions and denied admission never POST',async()=>{
 for(const opts of [{stale:true},{allow:false}]){
 const f=fixture(opts);await assert.rejects(f.transport.publish(input));assert.equal(f.calls.some(x=>x.method==='POST'),false);
 }
});
test('invalid branch or evidence never contacts API',async()=>{
 const f=fixture();
 await assert.rejects(f.transport.publish({...input,headBranch:'main'}));
 await assert.rejects(f.transport.publish({...input,request:{...request,patchDigest:'f'.repeat(64)}}));
 assert.equal(f.calls.length,0);
});
test('uncertain publication is surfaced without automatic retry',async()=>{
 const f=fixture({fail:true});await assert.rejects(f.transport.publish(input),/reconcile/);
 assert.equal(f.calls.filter(x=>x.method==='POST').length,1);
});
