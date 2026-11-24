'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createRestrictedManager}=require('../src/automation/engineeringTeam/restrictedManager');
const {createGitHubReadTransport}=require('../src/automation/engineeringTeam/githubReadTransport');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const issue=118;
function fixture({state='open',labels=[],runs=[{id:1,name:'CI',status:'completed',conclusion:'success',head_sha:scope.sha}],total=runs.length,issueScope=scope.repository,ciScope=scope.sha,readAlertSummary}={}){
 const calls=[];
 const transport={
  async readIssueStatus(s){calls.push(['issue',s]);return {repository:issueScope,issue,state,labels,body:'must not appear'};},
  async readCI(s){calls.push(['ci',s]);return {repository:scope.repository,sha:ciScope,text:JSON.stringify({runs,total})};}
 };
 return {manager:createRestrictedManager({scope,issue,transport,readAlertSummary}),calls};
}
function denied(r){for(const k of ['executionAuthorized','writeAuthorized','deployAuthorized','paidProviderAuthorized'])assert.equal(r[k],false);}
test('restricted manager exposes only observation and bounded metadata',async()=>{
 const {manager,calls}=fixture();
 assert.deepEqual(Object.keys(manager),['observe']);
 assert.equal(calls.length,0);
 const r=await manager.observe();denied(r);
 assert.equal(r.status,'observed');assert.equal(r.attention,'monitoring');
 assert.equal(r.governance.status,'not_configured');
 assert.equal(JSON.stringify(r).includes('must not appear'),false);
 assert.equal(calls.length,2);
 assert.deepEqual(calls[0][1],{...scope,issue});
 assert.deepEqual(calls[1][1],scope);
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.runs));
});
test('restricted manager classifies closed blocked failed and partial evidence',async()=>{
 for(const [opts,attention] of [[{state:'closed'},'issue_closed'],[{labels:['ACA:AUTO/BLOCKED']},'issue_blocked'],[{runs:[{id:1,name:'CI',status:'completed',conclusion:'failure',head_sha:scope.sha}]},'ci_attention'],[{total:2},'incomplete_evidence'],[{runs:[]},'incomplete_evidence']]){
  const r=await fixture(opts).manager.observe();denied(r);assert.equal(r.attention,attention);
 }
});
test('restricted manager rejects scope substitution duplicate runs and malformed evidence',async()=>{
 const run={id:1,name:'CI',status:'completed',conclusion:'success',head_sha:scope.sha};
 for(const opts of [{issueScope:'other/repo'},{ciScope:'b'.repeat(40)},{runs:[run,run]},{runs:[{...run,head_sha:'b'.repeat(40)}]},{state:'unknown'},{total:0}]){
  const r=await fixture(opts).manager.observe();denied(r);assert.equal(r.status,'unavailable');
 }
});
test('governance reporting is scoped bounded and read-only; failures are explicit',async()=>{
 const r=await fixture({readAlertSummary:async s=>({...s,pending:2,partial:false,secret:'never report'})}).manager.observe();
 assert.deepEqual(r.governance,{status:'observed',pending:2,partial:false});denied(r);
 for(const readAlertSummary of [async s=>({...s,product:'other',pending:1,partial:false}),async s=>({...s,pending:101,partial:true}),async()=>{throw Error('fixture secret');}]){
  const x=await fixture({readAlertSummary}).manager.observe();
  assert.equal(x.status,'observed');assert.deepEqual(x.governance,{status:'unavailable'});denied(x);
 }
});
test('metadata-only GitHub transport omits issue body and uses GET with redirect denial',async()=>{
 const requests=[];
 const transport=createGitHubReadTransport({token:'fixture-token',fetchImpl:async(url,options)=>{
  requests.push({url,options});return new Response(JSON.stringify({number:issue,state:'open',labels:[{name:'aca:auto/blocked'}],body:'x'.repeat(20000)}));
 }});
 const r=await transport.readIssueStatus({...scope,issue});
 assert.deepEqual(r,{repository:scope.repository,issue,state:'open',labels:['aca:auto/blocked']});
 assert.equal(requests[0].url,'https://api.github.com/repos/fixture/aca/issues/118');
 assert.equal(requests[0].options.method,'GET');assert.equal(requests[0].options.redirect,'error');
});
