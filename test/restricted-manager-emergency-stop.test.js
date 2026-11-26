'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createRestrictedManagerRuntime}=require('../src/automation/engineeringTeam/restrictedManagerRuntime');
const scope={product:'aca',repository:'owner/repo',sha:'a'.repeat(40)};
function runtime(readStopState,fetchImpl){return createRestrictedManagerRuntime({scope,issue:118,githubToken:'fixture',readStopState,fetchImpl});}
test('missing, active or failing stop state denies all network access',async()=>{
 for(const reader of [undefined,async()=>true,async()=>{throw Error('offline')},async()=>null]){
 let calls=0;const result=await runtime(reader,async()=>{calls++;throw Error('unexpected')}).observe();
 assert.equal(calls,0);assert.equal(result.status,'unavailable');assert.equal(result.executionAuthorized,false);assert.equal(result.writeAuthorized,false);
 }
});
test('stop during observation suppresses evidence',async()=>{
 let reads=0,calls=0;
 const result=await runtime(async()=>++reads>1,async url=>{calls++;return new Response(JSON.stringify(url.includes('/issues/')?{number:118,state:'open',labels:[]}:{workflow_runs:[],total_count:0}));}).observe();
 assert.equal(calls,2);assert.equal(reads,2);assert.equal(result.status,'unavailable');assert.equal(result.deployAuthorized,false);
});
