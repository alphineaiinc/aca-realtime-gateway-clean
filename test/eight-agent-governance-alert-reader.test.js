'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createGovernanceAlertReader}=require('../src/automation/engineeringTeam/governanceAlertReader');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
function fixture(actor={...scope,id:'manager',permission:'queue.manage'}){
 const calls=[];
 const reader=createGovernanceAlertReader({pool:{query:async(sql,args)=>{calls.push({sql,args});return {rows:[{id:'event-1',event_type:'stop.created',role:null,actor_id:'manager',approval_id:null}]};}},scope,authenticate:async credential=>credential==='manager'?actor:null});
 return {reader,calls};
}
test('governance alert reader returns scoped metadata with bounded read-only query',async()=>{
 const f=fixture();const rows=await f.reader.list({credential:'manager',limit:10});
 assert.equal(rows.length,1);assert.equal(rows[0].event_type,'stop.created');
 assert.match(f.calls[0].sql,/WHERE product=\\$1 AND repository=\\$2 ORDER BY created_at DESC/);
 assert.deepEqual(f.calls[0].args,['aca','fixture/aca',10]);
 assert.ok(Object.isFrozen(rows));assert.ok(Object.isFrozen(rows[0]));
});
test('governance alert reader denies wrong identity, cross-scope and invalid limits before query',async()=>{
 const f=fixture();
 await assert.rejects(f.reader.list({credential:'invalid'}),/identity denied/);
 await assert.rejects(f.reader.list({credential:'manager',limit:101}),/Invalid alert limit/);
 const g=fixture({...scope,id:'worker',role:'backend-developer',permission:'queue.work'});
 await assert.rejects(g.reader.list({credential:'manager'}),/identity denied/);
 assert.equal(f.calls.length,0);assert.equal(g.calls.length,0);
});
