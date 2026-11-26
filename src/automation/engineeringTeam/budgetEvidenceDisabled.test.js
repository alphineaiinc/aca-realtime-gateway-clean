'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {authenticate,recordSettlement}=require('./budgetEvidenceDisabled');
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const keys={test:publicKey.export({type:'spki',format:'pem'})},now=1000,month='2026-11',id='a';
function envelope(p={}){const payload=JSON.stringify({kind:'settlement',month,id,reservationDigest:'a'.repeat(64),currency:'CAD',issuedAt:900,expiresAt:1100,actualCents:500,...p});return {keyId:'test',payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')};}
test('signature and scope verified; tampering and expiry denied',()=>{const e=envelope();assert.equal(authenticate(e,keys,{id},now).payload.id,id);assert.throws(()=>authenticate({...e,payload:e.payload+' '},keys,{id},now));assert.throws(()=>authenticate(e,keys,{id:'b'},now));assert.throws(()=>authenticate(e,keys,{id},1100));});
function fixture(){let state={month,reconciled:true,entries:[{id,evidenceSha256:'a'.repeat(64),workCents:600,cleanupCents:100}]};let staged;return {state:()=>state,pool:{async connect(){return {async query(q,a){if(q.startsWith('SELECT state'))return {rowCount:1,rows:[{state}]};if(q.startsWith('UPDATE')){staged=JSON.parse(a[1]);return {rowCount:1};}if(q==='COMMIT')state=staged;return {};},release(){}};}}};}
test('settlement retains reservation and rejects replay',async()=>{const f=fixture(),args={pool:f.pool,keys,envelope:envelope(),month,id,clock:()=>now};await recordSettlement(args);assert.equal(f.state().entries[0].workCents,600);assert.equal(f.state().settlementObservations.length,1);await assert.rejects(recordSettlement(args),/already recorded/);});
test('overrun blocks further admission',async()=>{const f=fixture();await recordSettlement({pool:f.pool,keys,envelope:envelope({actualCents:701}),month,id,clock:()=>now});assert.equal(f.state().reconciled,false);});
