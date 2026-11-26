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
 r.domain='sg001-pilot-evidence-v2';
 assert.equal(await check({record:r,signature:'0'.repeat(128)},'preparation',r.binding),null);
 assert.equal(await check({record:r,signature:'0'.repeat(128)},'teardown',r.binding),null);
});
test('verified composition does not accept caller evidence or authorize execution',async()=>{
 let loaded=0,authenticated=0;
 const recorder=createVerifiedPilotRecorder({store:{transact:async(_,fn)=>fn({read:async()=>null,insert:async()=>assert.fail('unexpected insert')})},authenticate:async()=>{authenticated++;return null;},loadEvidence:async()=>{loaded++;return null;},verifyEvidence:async()=>null});
 const result=await recorder.record({scope:{runId:'r1'},credential:'invalid',approval:{authorized:true},evidence:{isolated:true}});
 assert.equal(result.status,'denied');assert.equal(loaded,1);assert.equal(authenticated,0);assert.equal(recorder.executionAllowed(),false);
});

test('pilot identity requires dedicated audience and denies malformed credentials',async()=>{
 const {createPilotOwnerVerifier}=require('../src/automation/engineeringTeam/pilotVerifiedEvidence');
 const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const config={publicKey:publicKey.export({type:'spki',format:'pem'}),issuer:'fixture',audience:'sg001-pilot-preparation-v1',principals:[{id:'owner',permission:'owner.approval',product:'development-automation',repository:'alphineaiinc/aca-realtime-gateway-clean',sha:'a'.repeat(40)}],isRevoked:async()=>false};
 assert.throws(()=>createPilotOwnerVerifier({...config,audience:'generic'}));
 assert.throws(()=>createPilotOwnerVerifier({...config,principals:[{...config.principals[0],product:'aca'}]}));
 const verify=createPilotOwnerVerifier(config);
 assert.equal(await verify('invalid','a'.repeat(64)),null);
 assert.equal(await verify('invalid',undefined),null);
});

test('canonical evidence encoding preserves recursive object ordering invariance and array order',()=>{const {canonicalJson}=require('../src/automation/engineeringTeam/pilotVerifiedEvidence');assert.equal(canonicalJson({zz:{b:2,a:1},a:[{y:2,x:1},3]}),canonicalJson({a:[{x:1,y:2},3],zz:{a:1,b:2}}));assert.notEqual(canonicalJson([1,2]),canonicalJson([2,1]));assert.throws(()=>canonicalJson(undefined));});
