'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {createActivationManifest}=require('../src/automation/engineeringTeam/activationManifest');
const {createActivationReviewVerifier}=require('../src/automation/engineeringTeam/activationReviewVerifier');
const {roles}=require('../src/automation/engineeringTeam/registry');
const manifest=createActivationManifest({scope:{product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)},models:Object.fromEntries(Object.keys(roles).map(r=>[r,'fixture'])),budgetId:'11111111-1111-1111-1111-111111111111',paths:['src/example.js'],issue:42,runnerImage:'node@sha256:'+'b'.repeat(64),limits:{maxCalls:8,maxOutputTokens:256,maxSpendMicrousd:1000}});
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const opts={manifest,publicKey,reviewerId:'fixture-reviewer',authorIds:['fixture-author'],isRevoked:async()=>false};
function envelope(changes={},domain='aca-engineering-activation-review-v1'){
 const now=Math.floor(Date.now()/1000);
 const record={manifestDigest:manifest.evidenceSha256,reviewerId:opts.reviewerId,status:'passed',findings:0,issuedAt:now-1,expiresAt:now+60,...changes};
 const payload=JSON.stringify([domain,record.manifestDigest,record.reviewerId,record.status,record.findings,record.issuedAt,record.expiresAt]);
 return {record,signature:sign(null,Buffer.from(payload),privateKey).toString('hex')};
}
test('valid independent fixture acceptance verifies without execution grant',async()=>{
 const result=await createActivationReviewVerifier(opts).verify(envelope());
 assert.equal(result.manifestDigest,manifest.evidenceSha256);assert.equal(result.executionAuthorized,false);
});
test('wrong domain, altered signature, manifest, reviewer, findings or expiration denied',async()=>{
 const v=createActivationReviewVerifier(opts);
 const now=Math.floor(Date.now()/1000);
 for(const e of [envelope({},'aca-review-v1'),{...envelope(),signature:'0'.repeat(128)},envelope({manifestDigest:'c'.repeat(64)}),envelope({reviewerId:'other'}),envelope({findings:1}),envelope({issuedAt:now-60,expiresAt:now-1}),envelope({issuedAt:now+10,expiresAt:now+60})])assert.equal(await v.verify(e),null);
});
test('self-review and revoked or unavailable reviewer denied',async()=>{
 assert.throws(()=>createActivationReviewVerifier({...opts,authorIds:[opts.reviewerId]}));
 for(const isRevoked of [async()=>true,async()=>undefined,async()=>{throw Error('unavailable');}])assert.equal(await createActivationReviewVerifier({...opts,isRevoked}).verify(envelope()),null);
});
