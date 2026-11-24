const test=require('node:test');
const assert=require('node:assert/strict');
const {createBillingPeriodClosure}=require('../src/security/billingPeriodClosure');
test('existing closure is returned without creating another invoice',async()=>{
 const queries=[];
 const close=createBillingPeriodClosure({connect:async()=>({release(){},query:async(sql)=>{queries.push(sql);return sql.startsWith('SELECT invoice_id')?{rowCount:1,rows:[{invoice_id:4,amount_cents:'500'}]}:{rowCount:0};}})});
 await assert.rejects(close(1,'2026-02-02'));assert.equal(queries.length,0);
 assert.deepEqual(await close(1,'2026-02-01'),{invoice_id:4,amount_cents:'500'});
 assert.ok(!queries.some(q=>q.startsWith('INSERT')));
 assert.equal(queries.at(-1),'COMMIT');
});
