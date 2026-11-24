'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,createHash,sign}=require('node:crypto');
const {verifyTeardownEvidence}=require('../scripts/protected-sandbox/authenticatedTeardownEvidence');
// Ephemeral synthetic keys and signatures in unit tests only.
const expected={repositoryId:1,runId:2,runAttempt:3,headSha:'a'.repeat(40),workflowBlob:'b'.repeat(40),harnessBlob:'c'.repeat(40),imageManifest:'d'.repeat(64),publisherEvidence:'e'.repeat(64),runnerIdentityDigest:'f'.repeat(64)};
const challenge='9'.repeat(64),now=1000;
const keys=Object.fromEntries(['runner','publisher'].map(role=>[role,generateKeyPairSync('ed25519')]));
const trust=Object.fromEntries(Object.entries(keys).map(([role,k])=>[role,{authority:role+'-control',publicKey:k.publicKey,fingerprint:createHash('sha256').update(k.publicKey.export({type:'spki',format:'der'})).digest('hex')}]));
function envelope(role,patch={},key=keys[role].privateKey){
 const record={...expected,authority:trust[role].authority,challenge,issuedAt:990,expiresAt:1050,...(role==='runner'?{lifecycle:'destroyed',quarantineCleared:true,residualCount:0}:{provenanceVerified:true,sourceProtected:true}),...patch};
 return {record,signature:sign(null,Buffer.from(JSON.stringify(['alphine-sandbox-evidence-v1',role,...Object.values(record)])),key).toString('hex')};
}
const check=(patch={})=>verifyTeardownEvidence({expected,challenge,now,trust,runner:envelope('runner'),publisher:envelope('publisher'),...patch});
test('independent valid evidence is authenticated but never authorizes execution',()=>{
 const result=check();assert.equal(result.authenticated,true);assert.equal(result.reconciled,false);assert.equal(result.executionAuthorized,false);assert.equal(result.attestation,false);assert.match(result.evidenceDigest,/^[a-f0-9]{64}$/);
});
test('reject shared keys, shared authority, private material and wrong pins',()=>{
 for(const publisher of [{...trust.publisher,publicKey:trust.runner.publicKey,fingerprint:trust.runner.fingerprint},{...trust.publisher,authority:trust.runner.authority},{...trust.publisher,publicKey:keys.publisher.privateKey},{...trust.publisher,fingerprint:'0'.repeat(64)}])assert.equal(check({trust:{...trust,publisher}}).authenticated,false);
});
test('reject swapped, tampered and untrusted signatures',()=>{
 const runner=envelope('runner');runner.record.runId=9;
 for(const patch of [{runner},{runner:envelope('runner',{},keys.publisher.privateKey)},{publisher:envelope('runner')},{runner:{record:envelope('runner').record,signature:'0'.repeat(128)}}])assert.equal(check(patch).authenticated,false);
});
test('reject challenge replay, stale, future and overlong evidence',()=>{
 for(const patch of [{challenge:'0'.repeat(64)},{runner:envelope('runner',{expiresAt:now})},{publisher:envelope('publisher',{issuedAt:now+1})},{publisher:envelope('publisher',{expiresAt:1200})}])assert.equal(check(patch).authenticated,false);
});
test('bind every execution scope field for both authorities',()=>{
 for(const field of Object.keys(expected))for(const role of ['runner','publisher'])assert.equal(check({[role]:envelope(role,{[field]:null})}).authenticated,false);
});
test('deny unresolved teardown and provenance even with authentic signatures',()=>{
 for(const patch of [{lifecycle:'running'},{quarantineCleared:false},{residualCount:1}])assert.equal(check({runner:envelope('runner',patch)}).authenticated,false);
 for(const patch of [{provenanceVerified:false},{sourceProtected:false}])assert.equal(check({publisher:envelope('publisher',patch)}).authenticated,false);
});
