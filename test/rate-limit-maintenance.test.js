'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runRateLimitMaintenance } = require('../src/middleware/postgresRateLimit');
test('maintenance stops at configured batch budget', async () => {
 let calls = 0;
 const pool = { async query(sql, params) { calls++; assert.match(sql,/SKIP LOCKED/); assert.deepEqual(params,[3]); return {rowCount:3}; } };
 assert.deepEqual(await runRateLimitMaintenance(pool,{batchSize:3,maxBatches:2}),{deleted:6,batches:2,budgetExhausted:true});
 assert.equal(calls,2);
});
test('maintenance stops early when fewer expired rows remain', async () => {
 let calls=0;
 const pool={async query(){calls++;return {rowCount:calls===1?3:1};}};
 assert.deepEqual(await runRateLimitMaintenance(pool,{batchSize:3,maxBatches:5}),{deleted:4,batches:2,budgetExhausted:false});
});
test('maintenance rejects invalid budgets and propagates store failure', async () => {
 let calls=0;
 const pool={async query(){calls++;throw Error('unavailable');}};
 await assert.rejects(runRateLimitMaintenance(pool,{maxBatches:21}),TypeError);
 assert.equal(calls,0);
 await assert.rejects(runRateLimitMaintenance(pool),/unavailable/);
 assert.equal(calls,1);
});
