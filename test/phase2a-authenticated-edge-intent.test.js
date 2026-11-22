"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createHash,generateKeyPairSync}=require("node:crypto");
const {prepareAuthenticatedEdgeIntent}=require("../src/automation/phase2aAuthenticatedEdgeIntent");
const {verifyOwnerEdgeProof}=require("../src/automation/phase2aOwnerEdgeProof");
const {makeOwnerDecisionPacket}=require("../src/automation/phase2aOwnerDecision");
const R=1080201236,OWNER=230486228,NOW=1700000000000;
const hash=x=>createHash("sha256").update(x).digest("hex");
const keys=generateKeyPairSync("ed25519");
const handoff={state:"request_owner_approval",dispatched:false,
 agentDispatchAuthorized:false,mergeAuthorized:false,deployAuthorized:false,
 request:{type:"manual_correction_approval_request",issueNumber:12,
 prNumber:13,headSha:"a".repeat(40),runId:777,attempt:1,maxAttempts:2}};
const packet=makeOwnerDecisionPacket({handoff,repositoryId:R,ownerId:OWNER,now:NOW});
function fixture(){
 const sessionId="S".repeat(43),csrf="C".repeat(43);
 let packetReads=0,evidenceReads=0;
 const options={sessionStore:{async getSession(d){
  if(d!==hash(sessionId))return null;
  return {ownerId:OWNER,csrfDigest:hash(csrf),createdAt:NOW,
   expiresAt:NOW+900000};
 }},cookie:"__Host-aca_owner="+sessionId,
 origin:"https://staging.example.test",expectedOrigin:"https://staging.example.test",
 csrfHeader:csrf,method:"POST",requestId:packet.id,decision:"approve",
 repositoryId:R,expectedOwnerId:OWNER,issuer:"aca-public-edge",
 audience:"aca-private-owner",signingKey:keys.privateKey,now:NOW+1000,
 loadPendingPacket:async()=>{packetReads++;return packet;},
 loadFreshHandoff:async()=>{evidenceReads++;return structuredClone(handoff);}
 };
 return {options,get reads(){return packetReads+evidenceReads;}};
}
function safe(result){
 for(const key of ["agentDispatchAuthorized","dispatched","mergeAuthorized",
 "deployAuthorized","signingAuthorized","productionAuthorization"])
  assert.equal(result[key],false,key);
}
test("verified session, CSRF, current packet and CI issue a signed advisory envelope",async()=>{
 const f=fixture(),result=await prepareAuthenticatedEdgeIntent(f.options);
 assert.equal(result.state,"ready_for_private_review");safe(result);
 assert.equal(f.reads,2);
 assert.deepEqual(Object.keys(result.body).sort(),["decision","proof","requestId"]);
 const used=new Set();
 const checked=await verifyOwnerEdgeProof({proof:result.body.proof,
  publicKey:keys.publicKey,expectedIssuer:"aca-public-edge",
  expectedAudience:"aca-private-owner",expectedRepositoryId:R,
  expectedOwnerId:OWNER,expectedRequestId:packet.id,
  expectedDecision:"approve",now:NOW+1100,
  nonceStore:{async claimOnce({nonce}){if(used.has(nonce))return false;
   used.add(nonce);return true;}}});
 assert.equal(checked.verified,true);safe({...checked,dispatched:false});
});
test("missing/cross-origin session, CSRF or wrong owner never loads evidence or signs",async()=>{
 for(const change of [
  {cookie:""},{csrfHeader:"z".repeat(43)},
  {origin:"https://evil.example.test"},{method:"GET"},
  {expectedOwnerId:OWNER+1},{now:NOW+900000}
 ]){
  const f=fixture(),r=await prepareAuthenticatedEdgeIntent({...f.options,...change});
  assert.equal(r.state,"blocked");safe(r);
  assert.equal(f.reads,0,JSON.stringify(change));
  assert.equal(r.body,undefined);
 }
});
test("unknown request ID is rejected after trusted packet lookup, before CI or signing",async()=>{
 const f=fixture();
 const r=await prepareAuthenticatedEdgeIntent({...f.options,requestId:"b".repeat(64)});
 assert.equal(r.state,"blocked");safe(r);assert.equal(f.reads,1);
 assert.equal(r.body,undefined);
});
test("stale PR, unavailable GitHub, mismatched owner packet cannot issue proof",async()=>{
 for(const change of [
  {loadPendingPacket:async()=>({...packet,ownerId:OWNER+1})},
  {loadPendingPacket:async()=>{throw Error("db offline");}},
  {loadFreshHandoff:async()=>({state:"verification_required"})},
  {loadFreshHandoff:async()=>({...handoff,request:{...handoff.request,
   headSha:"b".repeat(40)}})},
  {signingKey:null}
 ]){
  const f=fixture(),r=await prepareAuthenticatedEdgeIntent({...f.options,...change});
  assert.equal(r.state,"blocked");safe(r);
  assert.equal(r.body,undefined);
 }
});
test("rejection proof remains advisory and binds the rejection",async()=>{
 const f=fixture();
 const r=await prepareAuthenticatedEdgeIntent({...f.options,decision:"reject"});
 assert.equal(r.state,"ready_for_private_review");
 assert.equal(r.body.proof.decision,"reject");safe(r);
});
