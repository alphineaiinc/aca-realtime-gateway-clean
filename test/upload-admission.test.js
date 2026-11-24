'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { acquireUploadAdmission, withUploadAdmission } = require('../src/security/uploadAdmission');
function client(results) {
 const calls=[];
 return {calls,async query(sql,args){calls.push({sql,args});return {rows:[{acquired:results.shift()}]};}};
}
test('tenant contention rejects before global slot acquisition',async()=>{
 const c=client([false]);
 assert.equal(await acquireUploadAdmission(c,'tenant-a'),false);
 assert.equal(c.calls.length,1);
});
test('admission obtains first free global slot',async()=>{
 const c=client([true,false,true]);
 assert.equal(await acquireUploadAdmission(c,'tenant-a'),true);
 assert.deepEqual(c.calls.slice(1).map(x=>x.args),[[180422,0],[180422,1]]);
 assert.ok(c.calls.every(x=>x.sql.includes('pg_try_advisory_xact_lock')));
});
test('full global capacity denies after four attempts',async()=>{
 const c=client([true,false,false,false,false]);
 assert.equal(await acquireUploadAdmission(c,'tenant-a'),false);
 assert.equal(c.calls.length,5);
});
test('invalid identity and capacity fail before database access',async()=>{
 const c=client([]);
 await assert.rejects(acquireUploadAdmission(c,''),TypeError);
 await assert.rejects(acquireUploadAdmission(c,'tenant-a',5),TypeError);
 assert.equal(c.calls.length,0);
});
test('database errors propagate to caller for rollback',async()=>{
 await assert.rejects(acquireUploadAdmission({async query(){throw Error('unavailable');}},'tenant-a'),/unavailable/);
});

function owned(results,{failRollback=false}={}) {
 const calls=[];
 const client={async query(sql){calls.push(sql);if(sql==='ROLLBACK'&&failRollback)throw Error('rollback failed');return {rows:sql.includes('pg_try_advisory_xact_lock')?[{acquired:results.shift()}]:[]};},release(discard){calls.push(['release',discard]);}};
 return {calls,pool:{async connect(){return client;}}};
}
test('denied admission rolls back and never invokes work',async()=>{
 const h=owned([false]);
 assert.deepEqual(await withUploadAdmission(h.pool,'tenant-a',()=>assert.fail('work executed')),{admitted:false});
 assert.equal(h.calls[0],'BEGIN');assert.equal(h.calls.at(-2),'ROLLBACK');assert.deepEqual(h.calls.at(-1),['release',false]);
});
test('work exception rolls back and discards client',async()=>{
 const h=owned([true,true]);
 await assert.rejects(withUploadAdmission(h.pool,'tenant-a',()=>{throw Error('work failed');}),/work failed/);
 assert.equal(h.calls.at(-2),'ROLLBACK');assert.deepEqual(h.calls.at(-1),['release',true]);
});
test('rollback failure discards connection and does not report success',async()=>{
 const h=owned([true,true],{failRollback:true});
 await assert.rejects(withUploadAdmission(h.pool,'tenant-a',()=>42),/rollback failed/);
 assert.deepEqual(h.calls.at(-1),['release',true]);
});

test('connection loss signals protected work and prevents successful admission result',async()=>{
 const {EventEmitter}=require('node:events');
 const client=new EventEmitter();
 let discarded;
 client.query=async()=>({rows:[{acquired:true}]});
 client.release=value=>{discarded=value;};
 await assert.rejects(withUploadAdmission({connect:async()=>client},'tenant-a',async signal=>{
   assert.equal(signal.aborted,false);
   client.emit('error',Error('disconnected'));
   assert.equal(signal.aborted,true);
   return 42;
 }),/connection lost/);
 assert.equal(discarded,true);
 assert.equal(client.listenerCount('error'),0);
 assert.equal(client.listenerCount('end'),0);
});
