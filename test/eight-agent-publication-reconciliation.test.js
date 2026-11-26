'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {reconcilePublication}=require('../src/automation/engineeringTeam/publicationReconciliation');
const scope={binding:'a'.repeat(64),repository:'fixture/aca',baseBranch:'main',headBranch:'draft',baseSha:'b'.repeat(40),headSha:'c'.repeat(40)};
const pr={number:42,body:'Evidence binding: '+scope.binding,draft:true,state:'open',base:{repo:{full_name:scope.repository},ref:scope.baseBranch,sha:scope.baseSha},head:{repo:{full_name:scope.repository},ref:scope.headBranch,sha:scope.headSha}};
test('exact observed draft never authorizes retry or execution',()=>{
 const r=reconcilePublication({...scope,complete:true,observations:[pr]});
 assert.equal(r.state,'observed-draft');assert.equal(r.number,42);assert.equal(r.retryAuthorized,false);assert.equal(r.executionAuthorized,false);
});
test('absence, duplicates, stale refs, forks and incomplete observations remain unresolved',()=>{
 for(const observations of [[],[pr,pr],[{...pr,head:{...pr.head,sha:scope.baseSha}}],[{...pr,head:{...pr.head,repo:{full_name:'fork/aca'}}}],[{...pr,draft:false}]]){
 const r=reconcilePublication({...scope,complete:true,observations});assert.equal(r.state,'unresolved');assert.equal(r.retryAuthorized,false);
 }
 assert.equal(reconcilePublication({...scope,complete:false,observations:[pr]}).state,'unresolved');
});
