'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createRestrictedManagerRuntime}=require('../src/automation/engineeringTeam/restrictedManagerRuntime');
const scope={product:'aca',repository:'owner/repo',sha:'a'.repeat(40)};
test('restricted database observation uses read-only transaction and denies wrong mode',async()=>{
 for(const mode of ['on','off']){
 const calls=[];let released=false;
 const client={async query(sql,args){calls.push(sql);if(sql==='SHOW transaction_read_only')return {rows:[{transaction_read_only:mode}]};if(sql.startsWith('SELECT count')){assert.deepEqual(args,['aca','owner/repo']);return {rows:[{pending:1}]};}return {rows:[]};},release(destroy){released=destroy;}};
 const runtime=createRestrictedManagerRuntime({scope,issue:118,githubToken:'fixture',readStopState:async()=>false,readOnlyPool:{connect:async()=>client},fetchImpl:async url=>new Response(JSON.stringify(url.includes('/issues/')?{number:118,state:'open',labels:[]}:{workflow_runs:[],total_count:0}))});
 const result=await runtime.observe();
 assert.equal(calls[0],'BEGIN READ ONLY');assert.equal(released,true);
 assert.equal(result.governance.status,mode==='on'?'observed':'unavailable');
 assert.equal(calls.some(x=>x.startsWith('SELECT count')),mode==='on');
 assert.equal(calls.at(-1),mode==='on'?'COMMIT':'ROLLBACK');
 }
});
