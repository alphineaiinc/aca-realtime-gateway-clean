const test=require('node:test');
const assert=require('node:assert/strict');
const payout=require('../src/brain/utils/payoutManager');
test('all payout entry points fail closed',async()=>{
 for(const fn of Object.values(payout)){
  for(const args of [[1,100,'USD','stripe'],[1,100,'USD','wise'],[1,-1,'USD','unknown']]){
   assert.deepEqual(await fn(...args),{ok:false,error:'payout_activation_required'});
  }
 }
});
