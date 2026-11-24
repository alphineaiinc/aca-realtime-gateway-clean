'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createReconciliationStore}=require('../src/automation/engineeringTeam/publicationReconciliationStore');
const binding='a'.repeat(64),baseSha='b'.repeat(40),headSha='c'.repeat(40);
const actor={id:'manager-1',permission:'queue.manage',product:'aca',repository:'fixture/aca',sha:baseSha};
const reservation={binding,approval_id:'approval-1',product:'aca',repository:'fixture/aca',base_sha:baseSha,reserved_by:'manager-1',requested_by:'manager-1',head_sha:headSha};
const observation={binding,repository:'fixture/aca',baseSha,headSha,requesterId:'manager-1',baseBranch:'main',headBranch:'draft',complete:true,observations:[{number:7,body:'Evidence binding: '+binding,draft:true,state:'open',base:{repo:{full_name:'fixture/aca'},ref:'main',sha:baseSha},head:{repo:{full_name:'fixture/aca'},ref:'draft',sha:headSha}}]};
function fixture({prior=[],mismatch=false,failInsert=false}={}){
 const calls=[];let inserted=null,released=false,discard=false;
 const client={async query(sql,args=[]){calls.push({sql,args});if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rowCount:0,rows:[]};
 if(sql.includes('FROM engineering_team_publication_attempts'))return {rowCount:1,rows:[reservation]};
 if(sql.includes('FROM engineering_team_publication_reconciliation'))return {rowCount:prior.length,rows:prior};
 if(sql.includes('INSERT INTO engineering_team_publication_reconciliation')){if(failInsert)throw Error('insert failed');inserted={state:args[6],pr_number:args[7],observation_sha256:args[8]};return {rowCount:1,rows:[]};}
 throw Error('unexpected SQL '+sql);
 },release(value){released=true;discard=value===true;}};
 const pool={connect:async()=>client};
 const store=createReconciliationStore({pool,authenticate:async()=>actor,collect:async scope=>mismatch?{...observation,requesterId:'attacker'}:{...observation,...scope}});
 return {store,calls,client,get inserted(){return inserted;},get released(){return released;},get discard(){return discard;}};
}
test('persists exact requester-bound observation once and never authorizes retry',async()=>{
 const f=fixture();const result=await f.store.record({credential:'fixture',binding});
 assert.equal(result.state,'observed-draft');assert.equal(result.number,7);assert.equal(result.retryAuthorized,false);assert.equal(result.executionAuthorized,false);
 assert.equal(f.inserted.state,'observed-draft');assert.match(f.inserted.observation_sha256,/^[a-f0-9]{64}$/);assert.ok(f.calls.some(x=>x.sql==='COMMIT'));assert.equal(f.released,true);
});
test('scope mismatch rolls back and does not persist',async()=>{
 const f=fixture({mismatch:true});await assert.rejects(f.store.record({credential:'fixture',binding}),/scope mismatch/);
 assert.ok(f.calls.some(x=>x.sql==='ROLLBACK'));assert.equal(f.inserted,null);assert.equal(f.released,true);
});
test('existing durable observation is idempotently returned without recollection',async()=>{
 const f=fixture({prior:[{state:'unresolved',pr_number:null}]});const result=await f.store.record({credential:'fixture',binding});
 assert.equal(result.state,'unresolved');assert.equal(result.replayed,true);assert.equal(result.retryAuthorized,false);assert.equal(f.inserted,null);
});
test('database failure rolls back and connection is released',async()=>{
 const f=fixture({failInsert:true});await assert.rejects(f.store.record({credential:'fixture',binding}),/insert failed/);
 assert.ok(f.calls.some(x=>x.sql==='ROLLBACK'));assert.equal(f.released,true);
});
test('invalid binding rejected before database access',async()=>{
 let connected=false;const store=createReconciliationStore({pool:{connect:async()=>{connected=true;}},authenticate:async()=>actor,collect:async()=>observation});
 await assert.rejects(store.record({credential:'fixture',binding:'bad'}),/Invalid binding/);assert.equal(connected,false);
});
