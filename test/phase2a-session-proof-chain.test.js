"use strict";
// Isolated authenticated-session -> CSRF -> signed intent -> replay boundary.
// Test doubles only. No HTTP handlers, real OAuth, mTLS, SQL or dispatch.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync}=require("node:crypto");
const {beginLogin,finishLogin,validateOwnerAction}=
 require("../src/automation/phase2aOwnerSession");
const {createOwnerProofKeyring}=require("../src/automation/phase2aOwnerProofKeyring");
const {issueOwnerEdgeProof,verifyOwnerEdgeProof}=
 require("../src/automation/phase2aOwnerEdgeProof");
const NOW=1700000000000,OWNER=230486228,REPO=1080201236;
const ORIGIN="https://staging.example.test",REQUEST="e".repeat(64);
const keys=generateKeyPairSync("ed25519");
const keyring=createOwnerProofKeyring({activeKeyId:"edge-test-a",
 signingKeys:[{id:"edge-test-a",key:keys.privateKey,notBefore:NOW,notAfter:NOW+120000}],
 verificationKeys:[{id:"edge-test-a",key:keys.publicKey,notBefore:NOW,notAfter:NOW+120000}]});
function store(){
 const pending=new Map(),sessions=new Map(),nonces=new Set();
 return {nonces,async putPending(x){pending.set(x.digest,x);return true;},
 async consumePending(k){const x=pending.get(k);pending.delete(k);return x||null;},
 async putSession(x){sessions.set(x.digest,x);return true;},
 async getSession(k){return sessions.get(k)||null;},
 async claimOnce({nonce}){if(nonces.has(nonce))return false;nonces.add(nonce);return true;}};
}
async function fixture(){
 const db=store(),start=await beginLogin({store:db,now:NOW});
 const session=await finishLogin({store:db,
  loginCookie:start.setLoginCookie.split(";")[0],state:start.state,
  code:"synthetic-oauth-code",exchangeCode:async()=>"synthetic-oauth-token-123456789",
  serviceReadToken:"synthetic-read-token-123456789",
  expectedOwnerId:OWNER,expectedOwnerLogin:"alphineaiinc",now:NOW+100,
  fetchImpl:async()=>({ok:true,json:async()=>({id:OWNER,login:"alphineaiinc"})})});
 assert.equal(session.verified,true);
 return {db,session};
}
function action(x,overrides={}){
 return validateOwnerAction({store:x.db,cookie:x.session.setCookie.split(";")[0],
  origin:ORIGIN,expectedOrigin:ORIGIN,csrfHeader:x.session.csrfToken,
  method:"POST",now:NOW+200,...overrides});
}
function safe(x){
 for(const key of ["agentDispatchAuthorized","dispatched","mergeAuthorized","deployAuthorized",
  "signingAuthorized","productionAuthorization"])assert.equal(x[key],false,key);
}
async function pipeline(x,overrides={}){
 const owner=await action(x,overrides);
 if(!owner.verified)return {verified:false,reason:"session_rejected",...Object.fromEntries(
  ["agentDispatchAuthorized","dispatched","mergeAuthorized","deployAuthorized",
   "signingAuthorized","productionAuthorization"].map(k=>[k,false]))};
 const proof=issueOwnerEdgeProof({issuer:"aca-public-edge",audience:"aca-private-owner",
  repositoryId:REPO,ownerId:owner.ownerId,requestId:REQUEST,
  decision:"approve",now:NOW+300,keyring});
 const verified=await verifyOwnerEdgeProof({proof,keyring,nonceStore:x.db,
  expectedIssuer:"aca-public-edge",expectedAudience:"aca-private-owner",
  expectedRepositoryId:REPO,expectedOwnerId:OWNER,expectedRequestId:REQUEST,
  expectedDecision:"approve",now:NOW+400});
 return {verified:verified.verified,proof,verification:verified};
}
test("session plus CSRF permits one advisory proof and rejects replay",async()=>{
 const x=await fixture(),result=await pipeline(x);
 assert.equal(result.verified,true);safe(result.verification);
 const replay=await verifyOwnerEdgeProof({proof:result.proof,keyring,nonceStore:x.db,
  expectedIssuer:"aca-public-edge",expectedAudience:"aca-private-owner",
  expectedRepositoryId:REPO,expectedOwnerId:OWNER,expectedRequestId:REQUEST,
  expectedDecision:"approve",now:NOW+500});
 assert.equal(replay.verified,false);safe(replay);
 assert.equal(x.db.nonces.size,1);
});
test("invalid session, CSRF, origin and expired session cannot issue a proof",async()=>{
 const x=await fixture();
 for(const bad of [{csrfHeader:"x".repeat(43)},{cookie:""},
  {origin:"https://attacker.example.test"},{method:"GET"},
  {now:x.session.expiresAt}]){
  const r=await pipeline(x,bad);
  assert.equal(r.verified,false);safe(r);
 }
 assert.equal(x.db.nonces.size,0);
});

test("cross-slice owner session and signed proof never confer execution authority",async()=>{
 const x=await fixture();
 const authenticated=await action(x);
 assert.equal(authenticated.verified,true);safe(authenticated);
 const result=await pipeline(x);
 assert.equal(result.verified,true);safe(result.verification);
 const wrongAudience=await verifyOwnerEdgeProof({proof:result.proof,keyring,nonceStore:x.db,
  expectedIssuer:"aca-public-edge",expectedAudience:"untrusted-service",
  expectedRepositoryId:REPO,expectedOwnerId:OWNER,expectedRequestId:REQUEST,
  expectedDecision:"approve",now:NOW+500});
 assert.equal(wrongAudience.verified,false);safe(wrongAudience);
});
