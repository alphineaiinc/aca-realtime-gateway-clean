"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync}=require("node:crypto");
const {createOwnerProofKeyring}=require("../src/automation/phase2aOwnerProofKeyring");
const {issueOwnerEdgeProof,verifyOwnerEdgeProof}=
 require("../src/automation/phase2aOwnerEdgeProof");
const old=generateKeyPairSync("ed25519"),next=generateKeyPairSync("ed25519");
const now=1700000000000;
function ring(activeKeyId="edge-2026b",retired=false){
 const ids=["edge-2026a","edge-2026b"];
 const keys=[old,next];
 return createOwnerProofKeyring({
  activeKeyId,
  signingKeys:[{id:activeKeyId,key:keys[ids.indexOf(activeKeyId)].privateKey,
   notBefore:activeKeyId===ids[0]?now-10000:now,
   notAfter:activeKeyId===ids[0]?now+30000:now+100000}],
  verificationKeys:[{id:ids[0],key:old.publicKey,
   notBefore:now-10000,notAfter:retired?now-100000:now+30000},
   {id:ids[1],key:next.publicKey,notBefore:now,
    notAfter:now+100000}]
 });
}
const base={issuer:"aca-public-edge",audience:"aca-private-owner",
 repositoryId:1080201236,ownerId:230486228,
 requestId:"a".repeat(64),decision:"approve",now};
function args(proof,keyring,instant=now+1000){
 const used=new Set();
 return {proof,keyring,now:instant,
 expectedIssuer:base.issuer,expectedAudience:base.audience,
 expectedRepositoryId:base.repositoryId,expectedOwnerId:base.ownerId,
 expectedRequestId:base.requestId,expectedDecision:base.decision,
 nonceStore:{async claimOnce({nonce}){if(used.has(nonce))return false;
   used.add(nonce);return true;}}};
}
test("v2 proof pins signed key ID; rotation accepts known overlapping keys",async()=>{
 const current=ring(),oldRing=ring("edge-2026a");
 const newProof=issueOwnerEdgeProof({...base,keyring:current});
 const oldProof=issueOwnerEdgeProof({...base,keyring:oldRing,now:now+1});
 assert.equal(newProof.version,"aca-owner-edge-proof-v2");
 assert.equal(newProof.keyId,"edge-2026b");
 assert.equal(oldProof.keyId,"edge-2026a");
 assert.equal((await verifyOwnerEdgeProof(args(newProof,current))).verified,true);
 assert.equal((await verifyOwnerEdgeProof(args(oldProof,current))).verified,true);
});
test("no key substitution, unknown ID, retired key or legacy fallback",async()=>{
 const current=ring(),proof=issueOwnerEdgeProof({...base,keyring:current});
 const ancient=issueOwnerEdgeProof({...base,privateKey:old.privateKey});
 for(const altered of [
  {...proof,keyId:"edge-2026a"},
  {...proof,keyId:"unknown-key"},
  ancient
 ]){
  assert.equal((await verifyOwnerEdgeProof(args(altered,current))).verified,false);
 }
 const expired=ring("edge-2026b",true);
 const oldProof=issueOwnerEdgeProof({...base,keyring:ring("edge-2026a"),now:now+1});
 assert.equal((await verifyOwnerEdgeProof(args(oldProof,expired))).verified,false);
 assert.equal((await verifyOwnerEdgeProof(args(proof,ring(),now+100001))).verified,false);
});
test("expired active signing key and invalid keypair fail closed",()=>{
 const current=ring();
 assert.equal(issueOwnerEdgeProof({...base,keyring:current,now:now+100000}),null);
 assert.throws(()=>createOwnerProofKeyring({
  activeKeyId:"edge-2026b",
  signingKeys:[{id:"edge-2026b",key:old.privateKey,notBefore:now,notAfter:now+100000}],
  verificationKeys:[{id:"edge-2026b",key:next.publicKey,notBefore:now,notAfter:now+100000}]
 }),/invalid_owner_keyring/);
});
