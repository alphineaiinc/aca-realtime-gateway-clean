'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { acquireUploadAdmission } = require('../src/security/uploadAdmission');
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
