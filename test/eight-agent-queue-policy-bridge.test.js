'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createQueuePolicyBridge}=require('../src/automation/engineeringTeam/queuePolicyBridge');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const manifest={scope,issue:42,evidenceSha256:'b'.repeat(64),executionAuthorized:false};
const issue={number:42,state:'open',isPullRequest:false,labels:['aca:auto/docs-test'],assignees:[]};
const base={repository:scope.repository,headSha:scope.sha,issue,activeIssueNumbers:[]};
const bridge=state=>createQueuePolicyBridge({manifest,readQueueState:async()=>state});
test('queue policy evidence is exact scope and preparation only',async()=>{
 const result=await bridge(base).evaluate();
 assert.equal(result.eligibleForPreparation,true);assert.equal(result.executionAuthorized,false);
 assert.equal(result.manifestDigest,manifest.evidenceSha256);
});
test('existing allowlist, active lock and manual dispatch boundaries remain intact',async()=>{
 for(const state of [{...base,issue:{...issue,labels:[]}},{...base,activeIssueNumbers:[43]},{...base,issue:{...issue,state:'closed'}},{...base,issue:{...issue,assignees:['Codex']}}]){
  const result=await bridge(state).evaluate();assert.equal(result.eligibleForPreparation,false);assert.equal(result.executionAuthorized,false);
 }
});
test('missing or mismatched repository, head, issue and lock evidence denies evaluation',async()=>{
 for(const state of [{...base,headSha:'c'.repeat(40)},{...base,repository:'other/repo'},{...base,issue:{...issue,number:43}},{...base,activeIssueNumbers:undefined}]){
  await assert.rejects(bridge(state).evaluate(),/Queue evidence denied/);
 }
});
