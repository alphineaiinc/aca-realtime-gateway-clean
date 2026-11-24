'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDurableStripeProcessor } = require('../src/security/durableStripeProcessor');
test('completed or uncertain events never dispatch again', async () => {
  let state = null, calls = 0;
  const receipts = {
    async claim() { if (state) return {status:state==='completed'?'completed':'blocked'}; state='processing'; return {status:'claimed',claimId:'owner'}; },
    async finish(id,owner,next) { assert.equal(owner,'owner'); state=next; }
  };
  const event={id:'evt_test'};
  const run=createDurableStripeProcessor({receipts,deliver:async()=>{calls++;throw new Error('ambiguous');}});
  assert.equal(await run(event),'blocked');
  assert.equal(state,'uncertain');
  assert.equal(await run(event),'blocked');
  assert.equal(calls,1);
  state=null;
  const success=createDurableStripeProcessor({receipts,deliver:async()=>{calls++;}});
  assert.equal(await success(event),'completed');
  assert.equal(await success(event),'completed');
  assert.equal(calls,2);
});
test('database failure before claim prevents delivery', async()=>{
  const run=createDurableStripeProcessor({receipts:{claim:async()=>{throw new Error('db');}},deliver:async()=>assert.fail('unexpected dispatch')});
  await assert.rejects(run({id:'evt_test'}));
});
test('completion write failure propagates without a second delivery', async()=>{
  let claimed=false,calls=0;
  const run=createDurableStripeProcessor({receipts:{claim:async()=>{if(claimed)return {status:'blocked'};claimed=true;return {status:'claimed',claimId:'owner'};},finish:async()=>{throw new Error('db');}},deliver:async()=>{calls++;}});
  await assert.rejects(run({id:'evt_test'}));
  assert.equal(await run({id:'evt_test'}),'blocked');
  assert.equal(calls,1);
});
