"use strict";
// Development-only integration slice. No network, secrets, or execution hooks.
// This does NOT substitute for session/CSRF, mTLS, CI evidence or SQL E2E.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync}=require("node:crypto");
const {createOwnerProofKeyring}=require("../src/automation/phase2aOwnerProofKeyring");
const {issueOwnerEdgeProof,verifyOwnerEdgeProof}=
 require("../src/automation/phase2aOwnerEdgeProof");

const instant=1700000000000;
const keys=generateKeyPairSync("ed25519");
const base={issuer:"aca-public-edge",audience:"aca-private-owner",
 repositoryId:1080201236,ownerId:230486228,requestId:"c".repeat(64),
 decision:"approve",now:instant};
function ring(){
 return createOwnerProofKeyring({activeKeyId:"edge-test-a",
  signingKeys:[{id:"edge-test-a",key:keys.privateKey,
   notBefore:instant-1000,notAfter:instant+120000}],
  verificationKeys:[{id:"edge-test-a",key:keys.publicKey,
   notBefore:instant-1000,notAfter:instant+120000}]});
}
function nonceLedger(){
 const claimed=new Set();
 return {claimed,async claimOnce({nonce}){
  if(claimed.has(nonce))return false;
  claimed.add(nonce);return true;
 }};
}
function verify(proof,keyring,nonceStore,override={}){
 return verifyOwnerEdgeProof({proof,keyring,nonceStore,now:instant+1000,
  expectedIssuer:base.issuer,expectedAudience:base.audience,
  expectedRepositoryId:base.repositoryId,expectedOwnerId:base.ownerId,
  expectedRequestId:base.requestId,expectedDecision:base.decision,...override});
}
function advisoryOnly(result){
 for(const field of ["agentDispatchAuthorized","mergeAuthorized",
  "deployAuthorized","signingAuthorized","productionAuthorization"])
  assert.equal(result[field],false,field);
}
test("integration slice: rotated-key proof accepts once and remains advisory",async()=>{
 const keyring=ring(),ledger=nonceLedger();
 const proof=issueOwnerEdgeProof({...base,keyring});
 const accepted=await verify(proof,keyring,ledger);
 assert.equal(accepted.verified,true);advisoryOnly(accepted);
 assert.equal(ledger.claimed.size,1);
 const replay=await verify(proof,keyring,ledger);
 assert.equal(replay.verified,false);advisoryOnly(replay);
 assert.equal(ledger.claimed.size,1);
});
test("integration slice: invalid identity, stale proof, key ID and tampering fail closed",async()=>{
 const keyring=ring(),ledger=nonceLedger();
 const proof=issueOwnerEdgeProof({...base,keyring});
 const attacks=[
  [proof,{expectedOwnerId:base.ownerId+1}],
  [proof,{expectedRepositoryId:base.repositoryId+1}],
  [proof,{expectedRequestId:"d".repeat(64)}],
  [proof,{expectedDecision:"reject"}],
  [proof,{expectedAudience:"other-service"}],
  [proof,{now:instant+60000}],
  [{...proof,keyId:"unknown-key"},{}],
  [{...proof,decision:"reject"},{}],
  [{...proof,agentDispatchAuthorized:true},{}]
 ];
 for(const [candidate,override] of attacks){
  const result=await verify(candidate,keyring,ledger,override);
  assert.equal(result.verified,false);
  advisoryOnly(result);
 }
 assert.equal(ledger.claimed.size,0);
});
