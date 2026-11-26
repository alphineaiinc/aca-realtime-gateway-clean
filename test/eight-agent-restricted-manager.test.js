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
test('restricted manager flags cancelled and unknown completed CI outcomes for attention',async()=>{
 for(const conclusion of ['cancelled','stale','skipped','neutral',null,'unknown']){
  const r=await fixture({runs:[{id:1,name:'CI',status:'completed',conclusion,head_sha:scope.sha}]}).manager.observe();
  denied(r);assert.equal(r.attention,'ci_attention');
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
 assert.deepEqual(r.governance,{status:'observed',scope:'repository-wide',pending:2,partial:false});denied(r);
 for(const readAlertSummary of [async s=>({...s,product:'other',pending:1,partial:false}),async s=>({...s,pending:101,partial:true}),async()=>{throw Error('fixture secret');}]){
  const x=await fixture({readAlertSummary}).manager.observe();
  assert.equal(x.status,'observed');assert.deepEqual(x.governance,{status:'unavailable'});denied(x);
 }
});
test('metadata-only GitHub transport omits issue body and uses GET with redirect denial',async()=>{
 const requests=[];
 const transport=createGitHubReadTransport({token:'fixture-token',repository:scope.repository,fetchImpl:async(url,options)=>{
  requests.push({url,options});return new Response(JSON.stringify({number:issue,state:'open',labels:[{name:'aca:auto/blocked'}],body:'x'.repeat(20000)}));
 }});
 const r=await transport.readIssueStatus({...scope,issue});
 await assert.rejects(transport.readIssueStatus({...scope,repository:'other/repo',issue}),/Repository scope denied/);
 assert.deepEqual(r,{repository:scope.repository,issue,state:'open',labels:['aca:auto/blocked']});
 assert.equal(requests[0].url,'https://api.github.com/repos/fixture/aca/issues/118');
 assert.equal(requests[0].options.method,'GET');assert.equal(requests[0].options.redirect,'error');
});

test('restricted runtime composes only scoped GET and bounded SELECT observation',async()=>{
 const {createRestrictedManagerRuntime}=require('../src/automation/engineeringTeam/restrictedManagerRuntime');
 const calls=[];
 const runtime=createRestrictedManagerRuntime({scope,issue,readStopState:async()=>false,githubToken:'fixture-token',
  fetchImpl:async(url,options)=>{
   calls.push({url,method:options.method});
   return new Response(JSON.stringify(url.includes('/issues/')?{number:issue,state:'open',labels:[]}:{total_count:1,workflow_runs:[{id:1,name:'CI',status:'completed',conclusion:'success',head_sha:scope.sha}]}));
  },readOnlyPool:{connect:async()=>({release(){},query:async(sql,args)=>{if(sql==='SHOW transaction_read_only')return {rows:[{transaction_read_only:'on'}]};if(sql.startsWith('SELECT')){calls.push({sql,args});return {rows:[{pending:101}]};}return {rows:[]};}})}});
 assert.deepEqual(Object.keys(runtime),['observe']);
 assert.equal(calls.length,0);
 const report=await runtime.observe();
 denied(report);
 assert.equal(report.status,'observed');
 assert.deepEqual(report.governance,{status:'observed',scope:'repository-wide',pending:100,partial:true});
 assert.equal(calls.length,3);
 assert.ok(calls.slice(0,2).every(c=>c.method==='GET'));
 assert.ok(calls[2].sql.startsWith('SELECT'));
 assert.deepEqual(calls[2].args,[scope.product,scope.repository]);
 assert.match(calls[2].sql,/LIMIT 101/);
});

test('one-shot manager defaults disabled and rejects malformed configuration before network access',async()=>{
 const {observeOnce}=require('../src/automation/engineeringTeam/restrictedManagerOnce');
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('unexpected network');};
 await assert.rejects(observeOnce({fetchImpl}),/disabled/);
 await assert.rejects(observeOnce({env:{ACA_RESTRICTED_MANAGER_ENABLED:'1'},fetchImpl}),/disabled/);
 await assert.rejects(observeOnce({env:{ACA_RESTRICTED_MANAGER_ENABLED:'true',ACA_RESTRICTED_MANAGER_ISSUE:'1e2'},fetchImpl}),/Invalid issue/);
 await assert.rejects(observeOnce({env:{ACA_RESTRICTED_MANAGER_ENABLED:'true',ACA_RESTRICTED_MANAGER_ISSUE:'118'},fetchImpl}),/Invalid GitHub configuration/);
 assert.equal(calls,0);
});
test('one-shot manager observes once, never dispatches and never returns credentials',async()=>{
 const {observeOnce}=require('../src/automation/engineeringTeam/restrictedManagerOnce');
 const env={ACA_RESTRICTED_MANAGER_ENABLED:'true',ACA_RESTRICTED_MANAGER_ISSUE:String(issue),ACA_RESTRICTED_MANAGER_PRODUCT:scope.product,ACA_RESTRICTED_MANAGER_REPOSITORY:scope.repository,ACA_RESTRICTED_MANAGER_HEAD_SHA:scope.sha,ACA_RESTRICTED_MANAGER_GITHUB_READ_TOKEN:'private-fixture-token'};
 const calls=[];
 const report=await observeOnce({env,readStopState:async()=>false,fetchImpl:async(url,options)=>{
  calls.push({url,method:options.method});
  return new Response(JSON.stringify(url.includes('/issues/')?{number:issue,state:'open',labels:[]}:{total_count:1,workflow_runs:[{id:1,name:'CI',status:'completed',conclusion:'success',head_sha:scope.sha}]}));
 }});
 denied(report);assert.equal(report.status,'observed');assert.equal(calls.length,2);
 assert.ok(calls.every(c=>c.method==='GET'));
 assert.ok(!JSON.stringify(report).includes(env.ACA_RESTRICTED_MANAGER_GITHUB_READ_TOKEN));
 const failed=await observeOnce({env,readStopState:async()=>false,fetchImpl:async()=>{throw Error('private-fixture-token');}});
 denied(failed);assert.equal(failed.status,'unavailable');assert.ok(!JSON.stringify(failed).includes('private-fixture-token'));
});

test('restricted observer rejects oversized and malformed transport responses without leaking credentials',async()=>{
 for(const body of ['x'.repeat(262145),'{invalid JSON']){
  const transport=createGitHubReadTransport({token:'private-fixture-token',repository:scope.repository,fetchImpl:async()=>new Response(body)});
  await assert.rejects(transport.readIssueStatus({...scope,issue}),error=>error.message==='GitHub read failed');
 }
});
test('restricted transport refuses cross-repository reads before network access for every read method',async()=>{
 let calls=0;
 const transport=createGitHubReadTransport({token:'fixture-token',repository:scope.repository,fetchImpl:async()=>{calls++;throw Error('unexpected network');}});
 for(const name of ['readSource','readIssue','readIssueStatus','readCI']){
  await assert.rejects(transport[name]({...scope,repository:'other/repo',issue,path:'src/example.js'}),/Repository scope denied/);
 }
 assert.equal(calls,0);
});

test('restricted runtime isolates governance read failures and disabled entrypoint never accesses network',async()=>{
 const {createRestrictedManagerRuntime}=require('../src/automation/engineeringTeam/restrictedManagerRuntime');
 const {observeOnce}=require('../src/automation/engineeringTeam/restrictedManagerOnce');
 let requests=0,queries=0;
 const fetchImpl=async url=>{requests++;return new Response(JSON.stringify(url.includes('/issues/')?{number:issue,state:'open',labels:[]}:{total_count:1,workflow_runs:[{id:1,name:'CI',status:'completed',conclusion:'success',head_sha:scope.sha}]}));};
 const runtime=createRestrictedManagerRuntime({scope,issue,readStopState:async()=>false,githubToken:'fixture-token',fetchImpl,readOnlyPool:{connect:async()=>{queries++;throw Error('private database failure');}}});
 const report=await runtime.observe();
 denied(report);assert.equal(report.status,'observed');assert.deepEqual(report.governance,{status:'unavailable'});
 assert.equal(queries,1);assert.equal(requests,2);
 assert.ok(!JSON.stringify(report).includes('private database failure'));
 await assert.rejects(observeOnce({env:{ACA_RESTRICTED_MANAGER_ENABLED:'false'},fetchImpl}),/disabled/);
 assert.equal(requests,2);
});

test('one-shot manager fails closed without stop reader and suppresses output after stop',async()=>{
 const {observeOnce}=require('../src/automation/engineeringTeam/restrictedManagerOnce');
 const env={ACA_RESTRICTED_MANAGER_ENABLED:'true',ACA_RESTRICTED_MANAGER_ISSUE:String(issue),ACA_RESTRICTED_MANAGER_PRODUCT:scope.product,ACA_RESTRICTED_MANAGER_REPOSITORY:scope.repository,ACA_RESTRICTED_MANAGER_HEAD_SHA:scope.sha,ACA_RESTRICTED_MANAGER_GITHUB_READ_TOKEN:'fixture-token'};
 let calls=0,stops=0;
 const fetchImpl=async url=>{calls++;return new Response(JSON.stringify(url.includes('/issues/')?{number:issue,state:'open',labels:[]}:{total_count:1,workflow_runs:[{id:1,name:'CI',status:'completed',conclusion:'success',head_sha:scope.sha}]}));};
 const missing=await observeOnce({env,fetchImpl});denied(missing);assert.equal(missing.status,'unavailable');assert.equal(calls,0);
 const stopped=await observeOnce({env,fetchImpl,readStopState:async()=>++stops>1});denied(stopped);assert.equal(stopped.status,'unavailable');assert.equal(stops,2);assert.equal(calls,2);assert.equal(stopped.runs,undefined);
});
