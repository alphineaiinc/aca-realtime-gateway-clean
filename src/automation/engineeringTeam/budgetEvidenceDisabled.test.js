'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {authenticate,ledgerDigest}=require('./budgetEvidenceDisabled');
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const keys={test:publicKey.export({type:'spki',format:'pem'})},now=1000,month='2026-11',id='a';
function envelope(p={}){const payload=JSON.stringify({kind:'settlement',month,id,reservationDigest:'a'.repeat(64),currency:'CAD',issuedAt:900,expiresAt:1100,actualCents:500,...p});return {keyId:'test',payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')};}
test('signature and scope verified; tampering and expiry denied',()=>{const e=envelope();assert.equal(authenticate(e,keys,{id},now).payload.id,id);assert.throws(()=>authenticate({...e,payload:e.payload+' '},keys,{id},now));assert.throws(()=>authenticate(e,keys,{id:'b'},now));assert.throws(()=>authenticate(e,keys,{id},1100));});
test('canonical digest ignores object order at all levels and preserves array order', () => {
 const first = {long: [{amount: 1, id: 'a'}, {id: 'b'}], z: false};
 const jsonbLike = JSON.parse('{"z":false,"long":[{"id":"a","amount":1},{"id":"b"}]}');
 assert.equal(ledgerDigest(first), ledgerDigest(jsonbLike));
 assert.notEqual(ledgerDigest(first), ledgerDigest({...first, long: first.long.toReversed()}));
});
