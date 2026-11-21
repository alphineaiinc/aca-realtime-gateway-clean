"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync}=require("node:crypto");
const {issueOwnerEdgeProof}=require("../src/automation/phase2aOwnerEdgeProof");
const {handlePrivateOwnerIntent}=require("../src/automation/phase2aPrivateOwnerIntent");
const {makeOwnerDecisionPacket}=require("../src/automation/phase2aOwnerDecision");
const keys=generateKeyPairSync("ed25519"),R=1080201236,OWNER=230486228;
const NOW=1700000000000;
const handoff={state:"request_owner_approval",dispatched:false,
 agentDispatchAuthorized:false,mergeAuthorized:false,deployAuthorized:false,
 request:{type:"manual_correction_approval_request",issueNumber:12,
 prNumber:13,headSha:"a".repeat(40),runId:777,attempt:1,maxAttempts:2}};
const packet=makeOwnerDecisionPacket({handoff,repositoryId:R,ownerId:OWNER,now:NOW});
function fixture(decision="approve"){
 const body={decision,requestId:packet.id,proof:issueOwnerEdgeProof({
  issuer:"aca-public-edge",audience:"aca-private-owner",repositoryId:R,
  ownerId:OWNER,requestId:packet.id,decision,privateKey:keys.privateKey,now:NOW
 })};
 const used=new Set();
 let reads=0,writes=0;
 const deps={body,expectedIssuer:"aca-public-edge",expectedAudience:"aca-private-owner",
  repositoryId:R,ownerId:OWNER,publicKey:keys.publicKey,
  nonceStore:{async claimOnce({nonce}){if(used.has(nonce))return false;
   used.add(nonce);return true;}},
  loadPendingPacket:async()=>{reads++;return packet;},
  loadFreshHandoff:async()=>structuredClone(handoff),
  decisionClient:{query:async sql=>{writes++;if(sql.includes("UPDATE"))
   return {rows:[{request_id:packet.id}]};return {rows:[]};}},
  now:NOW+1000};
 return {deps,get reads(){return reads;},get writes(){return writes;}};
}
function safe(x){for(const k of ["agentDispatchAuthorized","mergeAuthorized",
 "deployAuthorized","signingAuthorized","productionAuthorization","dispatched"])
 assert.equal(x[k],false);}
test("private edge proof can record advisory intent only after trusted packet and CI",async()=>{
 const f=fixture(),r=await handlePrivateOwnerIntent(f.deps);
 assert.equal(r.state,"owner_intent_to_review");safe(r);
 assert.equal(f.reads,1);assert.ok(f.writes>0);
 const replay=await handlePrivateOwnerIntent(f.deps);
 assert.equal(replay.state,"blocked");safe(replay);
});
test("invalid audience, owner, action and repo denied before DB/evidence",async()=>{
 for(const change of [
  {expectedAudience:"other-private"},
  {ownerId:OWNER+1},
  {repositoryId:R+1},
  {body:{...fixture().deps.body,decision:"reject"}},
  {publicKey:generateKeyPairSync("ed25519").publicKey}
 ]){
  const f=fixture(),r=await handlePrivateOwnerIntent({...f.deps,...change});
  assert.equal(r.state,"blocked");safe(r);assert.equal(f.reads,0);
  assert.equal(f.writes,0);
 }
});
test("stale handoff, wrong packet owner and dependency errors never write",async()=>{
 for(const change of [
  {loadPendingPacket:async()=>({...packet,ownerId:OWNER+1})},
  {loadPendingPacket:async()=>{throw Error("database offline");}},
  {loadFreshHandoff:async()=>({state:"verification_required"})},
  {loadFreshHandoff:async()=>({...handoff,request:{...handoff.request,
   headSha:"b".repeat(40)}})}
 ]){
  const f=fixture(),r=await handlePrivateOwnerIntent({...f.deps,...change});
  assert.equal(r.state,"blocked");safe(r);assert.equal(f.writes,0);
 }
});
