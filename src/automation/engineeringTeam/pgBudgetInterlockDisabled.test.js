'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPgInterlockStore}=require('./pgBudgetInterlockDisabled');
test('CAS denies stale version and preserves pending across adapter recreation',async()=>{
 let row={version:'0',pending:null};const pool={async query(q,a){if(q.startsWith('SELECT'))return {rowCount:1,rows:[{...row}]};if(Number(row.version)!==a[2]||row.pending!==a[3])return {rowCount:0};row={version:String(a[0]),pending:a[1]};return {rowCount:1};}};
 const s=createPgInterlockStore(pool),old=await s.read();assert.equal(await s.compareAndSet(old,{version:1,pending:'a'}),true);assert.equal(await s.compareAndSet(old,{version:1,pending:'b'}),false);assert.deepEqual(await createPgInterlockStore(pool).read(),{version:1,pending:'a'});
});
test('missing row and invalid version fail closed',async()=>{for(const r of [{rowCount:0},{rowCount:1,rows:[{version:'9007199254740992',pending:null}]}])await assert.rejects(createPgInterlockStore({query:async()=>r}).read());});
