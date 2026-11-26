'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {generateKeyPairSync,sign,createHash}=require('node:crypto');
const {createAuthenticatedBudget}=require('./authenticatedBudgetDisabled');
const {reserveMonthly}=require('./aggregateMonthlyBudgetDisabled');
const now=Date.parse('2026-11-26T17:00:00Z'),month='2026-11';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const keys={test:publicKey.export({type:'spki',format:'pem'})};
function fixture(){
 let state={month,reconciled:true,fixedAndAccruedCents:0,entries:[],settlementObservations:[{id:'old'}]},staged;
 const pool={async connect(){return {async query(q,a){if(q.startsWith('SELECT state'))return {rowCount:1,rows:[{state}]};if(q.startsWith('UPDATE')){staged=JSON.parse(a[1]);return {rowCount:1};}if(q==='COMMIT')state=staged;return {};},release(){}};}};
 function input(patch={}){const p={kind:'reservation',currency:'CAD',month,id:'a',workCents:100,cleanupCents:100,fixedAndAccruedCents:0,requestExpiresAt:now+1000,issuedAt:now-1,expiresAt:now+2000,liabilityThrough:now+1000,allPriorLiabilitiesReconciled:true,providerHardLimitVerified:true,ledgerDigest:createHash('sha256').update(JSON.stringify(state)).digest('hex'),...patch};const payload=JSON.stringify(p);return [{id:p.id,month,workCents:100,cleanupCents:100,expiresAt:now+1000,evidenceSha256:createHash('sha256').update(payload).digest('hex')},{keyId:'test',payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')}];}
 return {pool,input,state:()=>state};
}
test('authenticated admission preserves settlement history and denies execution',async()=>{const f=fixture(),b=createAuthenticatedBudget({pool:f.pool,keys,clock:()=>now});const r=await b.reserve(...f.input());assert.equal(r.executionAuthorized,false);assert.deepEqual(f.state().settlementObservations,[{id:'old'}]);});
test('cross-month and unknown prior liabilities denied',async()=>{for(const patch of [{liabilityThrough:Date.parse('2026-12-01T05:00:00Z')},{allPriorLiabilitiesReconciled:false},{providerHardLimitVerified:false},{ledgerDigest:'bad'}]){const f=fixture();await assert.rejects(createAuthenticatedBudget({pool:f.pool,keys,clock:()=>now}).reserve(...f.input(patch)));assert.equal(f.state().entries.length,0);}});
test('missing roots and tampered evidence denied',async()=>{const f=fixture();assert.throws(()=>createAuthenticatedBudget({pool:f.pool,keys:{}}));const [r,e]=f.input();await assert.rejects(createAuthenticatedBudget({pool:f.pool,keys,clock:()=>now}).reserve(r,{...e,payload:e.payload+' '}));});
