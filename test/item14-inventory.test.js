const test=require('node:test');
const assert=require('node:assert/strict');
const inventory=require('../docs/security/item14-alert-inventory.json');
test('historical inventory has exactly 80 unique mapped candidates without false closure',()=>{
 assert.equal(inventory.alerts.length,80);
 assert.deepEqual(inventory.alerts.map(a=>a.number).sort((a,b)=>a-b),Array.from({length:80},(_,i)=>i+1));
 for(const a of inventory.alerts){assert.ok(a.path);assert.ok(a.rule);assert.ok(a.candidate_pr);assert.equal(a.disposition,'candidate-remediation');assert.equal(a.verified_closed,false);}
});
