'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProjectBoundary}=require('../src/automation/engineeringTeam/projectBoundary');
const {createQueuePolicyBridge}=require('../src/automation/engineeringTeam/queuePolicyBridge');
const scope={product:'development-automation',repository:'alphineaiinc/aca-realtime-gateway-clean',sha:'a'.repeat(40)};
const manifest={scope,issue:42,paths:['src/automation/engineeringTeam/projectBoundary.js'],evidenceSha256:'b'.repeat(64),executionAuthorized:false};
const authority={project:scope.product,repository:scope.repository,sourceSha:scope.sha,issue:42,taskId:'S3-04',branch:'automation/stage3-fixture',purpose:'automation-preparation',authorization:'owner-approved-preparation',transferRequested:false,paths:manifest.paths};
const request={scope,issueNumber:42};
const fresh=r=>({projectBoundary:r.projectBoundary,boundaryDigest:r.boundaryDigest,repository:scope.repository,headSha:scope.sha,issue:{number:42,state:'open',isPullRequest:false,labels:['aca:auto/docs-test'],assignees:[]},activeIssueNumbers:[]});
test('approved automation preparation remains subject to original queue policy',async()=>{
 const readQueueState=createProjectBoundary({manifest,authority,readQueueState:async r=>fresh(r)});
 const result=await createQueuePolicyBridge({manifest,readQueueState}).evaluate();
 assert.equal(result.eligibleForPreparation,true);assert.equal(result.executionAuthorized,false);
});
test('product backlog, transfer, ambiguous authority, wrong branch and unknown task deny before read',()=>{
 for(const a of [undefined,{...authority,project:'aca'},{...authority,purpose:'marketplace'},{...authority,transferRequested:true},{...authority,authorization:'assistant-proceed'},{...authority,branch:'main'},{...authority,taskId:'S3-09'},{...authority,repository:'other/repo'},{...authority,sourceSha:'c'.repeat(40)}])assert.throws(()=>createProjectBoundary({manifest,authority:a,readQueueState:async()=>assert.fail('read')}),/Project boundary denied/);
});
test('shared repository does not allow product source or path traversal',()=>{
 for(const paths of [['src/voice/product.js'],['src/automation/engineeringTeam/../product.js'],['test/product.test.js']])assert.throws(()=>createProjectBoundary({manifest:{...manifest,paths},authority:{...authority,paths},readQueueState:async()=>assert.fail('read')}),/Project boundary denied/);
});
test('fresh missing or mismatched evidence denies admission; no cached allow',async()=>{
 let calls=0;
 const readQueueState=createProjectBoundary({manifest,authority,readQueueState:async r=>{calls++;const s=fresh(r);return calls===1?s:{...s,projectBoundary:{...s.projectBoundary,project:'aca'}};}});
 const bridge=createQueuePolicyBridge({manifest,readQueueState});
 assert.equal((await bridge.evaluate()).eligibleForPreparation,true);
 await assert.rejects(bridge.evaluate(),/Project boundary evidence denied/);
 await assert.rejects(readQueueState({...request,scope:{...scope,product:'aca'}}),/Project boundary denied/);
 const missing=createProjectBoundary({manifest,authority,readQueueState:async()=>({})});
 await assert.rejects(missing(request),/Project boundary evidence denied/);
});
test('pinned authority cannot be changed by caller after construction',async()=>{
 const a={...authority,paths:[...authority.paths]};
 const gate=createProjectBoundary({manifest,authority:a,readQueueState:async r=>{assert.equal(r.projectBoundary.branch,authority.branch);return fresh(r);}});
 a.branch='main';a.paths[0]='src/voice/product.js';
 await gate(request);
});
