"use strict";
// Offline CI-evidence -> owner decision -> authenticated CSRF -> signed proof.
// No real OAuth, network mTLS, SQL, agent dispatch, signing, merge or deploy.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync}=require("node:crypto");
const {createCorrectionHandoff}=require("../src/automation/phase2aCorrectionHandoff");
const {makeOwnerDecisionPacket,recordOwnerDecision}=require("../src/automation/phase2aOwnerDecision");
const {beginLogin,finishLogin,validateOwnerAction}=require("../src/automation/phase2aOwnerSession");
const {createOwnerProofKeyring}=require("../src/automation/phase2aOwnerProofKeyring");
const {issueOwnerEdgeProof,verifyOwnerEdgeProof}=require("../src/automation/phase2aOwnerEdgeProof");
const NOW=1700000000000,REPO=1080201236,OWNER=230486228,WORKFLOW=422174901;
const HEAD="a".repeat(40),ORIGIN="https://staging.example.test";
const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const keyring=createOwnerProofKeyring({activeKeyId:"isolated-ci-test",
 signingKeys:[{id:"isolated-ci-test",key:privateKey,notBefore:NOW,notAfter:NOW+120000}],
 verificationKeys:[{id:"isolated-ci-test",key:publicKey,notBefore:NOW,notAfter:NOW+120000}]});
function handoff(changes={}){
 const event={action:"completed",repository:{id:REPO},workflow_run:{
  id:551,name:"ACA CI",workflow_id:WORKFLOW,status:"completed",conclusion:"failure",
  head_sha:HEAD,repository:{id:REPO},head_repository:{id:REPO}}};
 const pr={state:"open",draft:false,number:49,issueNumber:48,headSha:HEAD,
  repositoryId:REPO,baseRepositoryId:REPO};
 const history={attempts:0,unchangedFailureCount:0,headSha:HEAD,
  repositoryId:REPO,prNumber:49,issueNumber:48};
 if(changes.event)Object.assign(event.workflow_run,changes.event);
 if(changes.pr)Object.assign(pr,changes.pr);
 if(changes.history)Object.assign(history,changes.history);
 return createCorrectionHandoff({event,expectedRepositoryId:REPO,
  expectedWorkflowId:WORKFLOW,pr,verifiedIssueLink:changes.link!==false,history});
}
function storage(){
 const pending=new Map(),sessions=new Map(),nonces=new Set();
 return {nonces,async putPending(x){pending.set(x.digest,x);return true;},
 async consumePending(k){const x=pending.get(k);pending.delete(k);return x||null;},
 async putSession(x){sessions.set(x.digest,x);return true;},
 async getSession(k){return sessions.get(k)||null;},
 async claimOnce({nonce}){if(nonces.has(nonce))return false;nonces.add(nonce);return true;}};
}
async function authenticated(){
 const db=storage(),start=await beginLogin({store:db,now:NOW});
 const session=await finishLogin({store:db,loginCookie:start.setLoginCookie.split(";")[0],
  state:start.state,code:"synthetic-oauth-code",exchangeCode:async()=>"synthetic-oauth-token-123456789",
  serviceReadToken:"synthetic-read-token-123456789",expectedOwnerId:OWNER,
  expectedOwnerLogin:"alphineaiinc",now:NOW+100,
  fetchImpl:async()=>({ok:true,json:async()=>({id:OWNER,login:"alphineaiinc"})})});
 assert.equal(session.verified,true);
 return {db,session};
}
function safe(x){
 for(const k of ["agentDispatchAuthorized","mergeAuthorized","deployAuthorized",
  "signingAuthorized","productionAuthorization"])assert.equal(x[k],false,k);
}
async function run(x,ci=handoff(),overrides={}){
 const packet=makeOwnerDecisionPacket({handoff:ci,repositoryId:REPO,ownerId:OWNER,now:NOW+150});
 if(!packet)return {verified:false,reason:"untrusted_ci"};
 const owner=await validateOwnerAction({store:x.db,cookie:x.session.setCookie.split(";")[0],
  origin:ORIGIN,expectedOrigin:ORIGIN,csrfHeader:x.session.csrfToken,
  method:"POST",now:NOW+200,...overrides});
 if(!owner.verified)return {verified:false,reason:"owner_session_rejected"};
 const decision=recordOwnerDecision({packet,decision:"approve",actorId:owner.ownerId,
  currentHandoff:ci,repositoryId:REPO,now:NOW+250});
 if(decision.state!=="owner_intent_to_review")return {verified:false,reason:"stale_ci"};
 const proof=issueOwnerEdgeProof({issuer:"aca-public-edge",audience:"aca-private-owner",
  repositoryId:REPO,ownerId:owner.ownerId,requestId:packet.id,decision:"approve",
  now:NOW+300,keyring});
 const verification=await verifyOwnerEdgeProof({proof,keyring,nonceStore:x.db,
  expectedIssuer:"aca-public-edge",expectedAudience:"aca-private-owner",
  expectedRepositoryId:REPO,expectedOwnerId:OWNER,expectedRequestId:packet.id,
  expectedDecision:"approve",now:NOW+400});
 return {verified:verification.verified,proof,packet,verification,decision};
}
test("trusted CI, owner session, CSRF, decision and signed proof remain advisory only",async()=>{
 const x=await authenticated(),r=await run(x);
 assert.equal(r.verified,true);safe(r.decision);safe(r.verification);
 const replay=await verifyOwnerEdgeProof({proof:r.proof,keyring,nonceStore:x.db,
  expectedIssuer:"aca-public-edge",expectedAudience:"aca-private-owner",
  expectedRepositoryId:REPO,expectedOwnerId:OWNER,expectedRequestId:r.packet.id,
  expectedDecision:"approve",now:NOW+500});
 assert.equal(replay.verified,false);safe(replay);assert.equal(x.db.nonces.size,1);
});
test("stale or untrusted CI evidence cannot reach signed approval",async()=>{
 const x=await authenticated();
 for(const change of [{event:{head_sha:"b".repeat(40)}},{event:{conclusion:"success"}},
  {pr:{draft:true}},{pr:{headSha:"b".repeat(40)}},{history:{attempts:2}},
  {history:{unchangedFailureCount:1}},{link:false}]){
  const r=await run(x,handoff(change));assert.equal(r.verified,false);
 }
 assert.equal(x.db.nonces.size,0);
});
test("wrong owner session, CSRF, origin and method block CI-backed proof",async()=>{
 const x=await authenticated();
 for(const change of [{csrfHeader:"x".repeat(43)},{cookie:""},
  {origin:"https://evil.example.test"},{method:"GET"},{now:x.session.expiresAt}]){
  const r=await run(x,handoff(),change);assert.equal(r.verified,false);
 }
 assert.equal(x.db.nonces.size,0);
});
