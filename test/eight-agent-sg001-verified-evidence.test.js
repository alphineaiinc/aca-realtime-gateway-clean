'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const {createPilotEvidenceVerifier,createVerifiedPilotRecorder}=require('../src/automation/engineeringTeam/pilotVerifiedEvidence');
test('verification only: missing and malformed evidence deny, wrong domain denies',async()=>{
 const {publicKey}=generateKeyPairSync('ed25519');
 const check=createPilotEvidenceVerifier({publicKey:publicKey.export({type:'spki',format:'pem'}),issuer:'fixture',isRevoked:async()=>false,clock:()=>1000});
 assert.equal(await check(null,'preparation','a'.repeat(64)),null);
 const r={domain:'production-release',issuer:'fixture',kind:'preparation',binding:'a'.repeat(64),issuedAt:0,expiresAt:2000,body:{}};
 assert.equal(await check({record:r,signature:'0'.repeat(128)},'preparation',r.binding),null);
 r.domain='sg001-pilot-evidence-v1';
 assert.equal(await check({record:r,signature:'0'.repeat(128)},'preparation',r.binding),null);
 assert.equal(await check({record:r,signature:'0'.repeat(128)},'teardown',r.binding),null);
});
test('verified composition does not accept caller evidence or authorize execution',async()=>{
 let loaded=0,authenticated=0;
 const recorder=createVerifiedPilotRecorder({store:{transact:async(_,fn)=>fn({read:async()=>null,insert:async()=>assert.fail('unexpected insert')})},authenticate:async()=>{authenticated++;return null;},loadEvidence:async()=>{loaded++;return null;},verifyEvidence:async()=>null});
 const result=await recorder.record({scope:{runId:'r1'},credential:'invalid',approval:{authorized:true},evidence:{isolated:true}});
 assert.equal(result.status,'denied');assert.equal(loaded,1);assert.equal(authenticated,0);assert.equal(recorder.executionAllowed(),false);
});
