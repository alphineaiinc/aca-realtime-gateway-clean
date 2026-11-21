"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync}=require("node:crypto");
const {issueOwnerEdgeProof,verifyOwnerEdgeProof,TTL}=
 require("../src/automation/phase2aOwnerEdgeProof");
const keys=generateKeyPairSync("ed25519");
const other=generateKeyPairSync("ed25519");
const base={issuer:"aca-public-edge",audience:"aca-private-owner",
 repositoryId:1080201236,ownerId:230486228,requestId:"a".repeat(64),
 decision:"approve",privateKey:keys.privateKey,now:1700000000000};
function fakeStore(){
 const used=new Set();
 return {async claimOnce(x){if(used.has(x.nonce))return false;
  used.add(x.nonce);return true;},get size(){return used.size;}};
}
const input=(proof,store,overrides={})=>({proof,publicKey:keys.publicKey,
 expectedIssuer:base.issuer,expectedAudience:base.audience,
 expectedRepositoryId:base.repositoryId,expectedOwnerId:base.ownerId,
 expectedRequestId:base.requestId,expectedDecision:base.decision,
 nonceStore:store,now:base.now+1000,...overrides});
function safe(x){for(const key of ["agentDispatchAuthorized","mergeAuthorized",
 "deployAuthorized","signingAuthorized","productionAuthorization"])
 assert.equal(x[key],false,key);}
test("signed owner intent proof verifies exact audience and is consumed once",async()=>{
 const proof=issueOwnerEdgeProof(base),store=fakeStore();
 assert.ok(proof);assert.equal(proof.expiresAt-proof.issuedAt,TTL);
 const v=await verifyOwnerEdgeProof(input(proof,store));
 assert.equal(v.verified,true);assert.equal(v.ownerId,base.ownerId);safe(v);
 const replay=await verifyOwnerEdgeProof(input(proof,store));
 assert.equal(replay.verified,false);safe(replay);
 assert.equal(store.size,1);
});
test("wrong owner, repository, request, action or audience fail before claim",async()=>{
 const p=issueOwnerEdgeProof(base),store=fakeStore();
 for(const overrides of [
  {expectedOwnerId:base.ownerId+1},{expectedRepositoryId:123},
  {expectedRequestId:"b".repeat(64)},{expectedDecision:"reject"},
  {expectedAudience:"other-private-service"},{expectedIssuer:"attacker"},
  {now:base.now+TTL},{now:base.now-1},
  {publicKey:other.publicKey}]){
  const r=await verifyOwnerEdgeProof(input(p,store,overrides));
  assert.equal(r.verified,false);safe(r);
 }
 assert.equal(store.size,0);
});
test("tampering and injected authorization flags are rejected",async()=>{
 const p=issueOwnerEdgeProof(base),store=fakeStore();
 for(const mutation of [
  {ownerId:base.ownerId+1},{decision:"reject"},{nonce:"x".repeat(43)},
  {requestId:"b".repeat(64)},{agentDispatchAuthorized:true},
  {signature:"x".repeat(86)}
 ]){
  const result=await verifyOwnerEdgeProof(input({...p,...mutation},store));
  assert.equal(result.verified,false);safe(result);
 }
 assert.equal(store.size,0);
});
test("missing or failed atomic replay store refuses proof",async()=>{
 const p=issueOwnerEdgeProof(base);
 for(const nonceStore of [null,{claimOnce:async()=>false},
  {claimOnce:async()=>{throw Error("database offline");}}]){
  const result=await verifyOwnerEdgeProof(input(p,nonceStore));
  assert.equal(result.verified,false);safe(result);
 }
});
test("only valid Ed25519 signing key and bounded inputs accepted",()=>{
 assert.equal(issueOwnerEdgeProof({...base,privateKey:null}),null);
 assert.equal(issueOwnerEdgeProof({...base,requestId:"short"}),null);
 assert.equal(issueOwnerEdgeProof({...base,ownerId:0}),null);
});
