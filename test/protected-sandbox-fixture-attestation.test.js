'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,sign,createHash}=require('node:crypto');
const {createFixtureAttestationVerifier}=require('../src/automation/protectedSandbox/fixtureAttestation');
const {createFixtureReceiptStore}=require('../src/automation/protectedSandbox/fixtureReceiptStore');
const expected={harnessSha:'a'.repeat(40),image:'node@sha256:'+'b'.repeat(64),fixtureSha256:'c'.repeat(64),attemptId:'aca-fixture-12345678-1234-4234-8234-123456789abc'};
const keys=generateKeyPairSync('ed25519');
const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
const payload={...expected,status:'passed',cleanupConfirmed:true,requiresReconciliation:false,provenance:'unreviewed-fixed-fixture-harness',executionAuthorized:false};
const report={...payload,reportSha256:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
const receipt={...expected,reportSha256:report.reportSha256};
const message=Buffer.from('alphine:fixed-sandbox-attestation:v1\n'+JSON.stringify(receipt),'utf8');
const signature=sign(null,message,keys.privateKey).toString('hex');
test('valid signature is admitted once and never grants execution',async()=>{
 let calls=0;
 const verifier=createFixtureAttestationVerifier({publicKey,expected,consumeReceipt:async r=>{assert.deepEqual(r,receipt);calls++;return {status:'inserted',executionAuthorized:false};}});
 const results=await Promise.all([verifier.inspect({report,signature}),verifier.inspect({report,signature})]);
 assert.equal(results.filter(r=>r.status==='signature-verified').length,1);
 assert.ok(results.every(r=>r.executionAuthorized===false));
 assert.equal((await verifier.inspect({report,signature})).status,'denied');
 assert.equal(calls,1);
});
test('wrong key, forged signature, substituted attempt and unknown storage outcome deny',async()=>{
 let calls=0;
 const wrongKey=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});
 for(const [key,sig,exp] of [[wrongKey,signature,expected],[publicKey,'0'.repeat(128),expected],[publicKey,signature,{...expected,attemptId:'aca-fixture-12345678-1234-4234-8234-123456789abd'}]]){
  const v=createFixtureAttestationVerifier({publicKey:key,expected:exp,consumeReceipt:async()=>{calls++;return {status:'inserted',executionAuthorized:false};}});
  assert.equal((await v.inspect({report,signature:sig})).status,'denied');
 }
 assert.equal(calls,0);
 const v=createFixtureAttestationVerifier({publicKey,expected,consumeReceipt:async()=>{calls++;throw Error('private database error');}});
 assert.deepEqual(await v.inspect({report,signature}),{status:'unknown',requiresReconciliation:true,executionAuthorized:false});
 assert.deepEqual(await v.inspect({report,signature}),{status:'denied',executionAuthorized:false});
 assert.equal(calls,1);
});
test('scoped receipt store rejects substitutions and independent verifier instances cannot reuse a receipt in the shared fixture store',async()=>{
 const seen=new Set();let calls=0;
 const pool={query:async(sql,params)=>{
  calls++;assert.match(sql,/ON CONFLICT DO NOTHING/);
  assert.deepEqual(params,[expected.attemptId,expected.harnessSha,expected.image,expected.fixtureSha256,report.reportSha256]);
  if(seen.has(params[0]))return {rowCount:0,rows:[]};
  seen.add(params[0]);return {rowCount:1,rows:[{attempt_id:params[0]}]};
 }};
 const {consumeReceipt}=createFixtureReceiptStore({pool,expected});
 assert.equal((await consumeReceipt({...receipt,image:'node:22'})).status,'denied');assert.equal(calls,0);
 const make=()=>createFixtureAttestationVerifier({publicKey,expected,consumeReceipt:createFixtureReceiptStore({pool,expected}).consumeReceipt});
 const results=await Promise.all([make().inspect({report,signature}),make().inspect({report,signature})]);
 assert.equal(results.filter(r=>r.status==='signature-verified').length,1);
 assert.equal((await make().inspect({report,signature})).status,'duplicate');
 assert.equal(calls,3);
});

test('receipt ambiguity is not retried and exact reconciliation never authorizes execution',async()=>{
 const store=createFixtureReceiptStore({pool:{query:async()=>{throw Error('lost response');}},expected});
 assert.deepEqual(await store.consumeReceipt(receipt),{status:'unknown',executionAuthorized:false});
 const reader={query:async(sql,params)=>{assert.match(sql,/SELECT EXISTS/);assert.deepEqual(params,[expected.attemptId,expected.harnessSha,expected.image,expected.fixtureSha256,report.reportSha256]);return {rows:[{matched:true}]};}};
 assert.deepEqual(await store.reconcileReceipt(receipt,reader),{status:'confirmed-present',executionAuthorized:false});
 assert.equal((await store.reconcileReceipt({...receipt,image:'node:22'},reader)).status,'denied');
 assert.equal((await store.reconcileReceipt(receipt,{query:async()=>({rows:[{matched:false}]})})).status,'unknown');
});
