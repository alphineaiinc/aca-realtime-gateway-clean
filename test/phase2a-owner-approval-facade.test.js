"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createHash}=require("node:crypto");
const {submitOwnerIntent}=require("../src/automation/phase2aOwnerApprovalFacade");
const {beginLogin,finishLogin}=require("../src/automation/phase2aOwnerSession");
const {makeOwnerDecisionPacket}=require("../src/automation/phase2aOwnerDecision");
const R=1080201236,OWNER=230486228,TIME=1700000000000;
const H="a".repeat(40);
const handoff={state:"request_owner_approval",dispatched:false,
 agentDispatchAuthorized:false,mergeAuthorized:false,deployAuthorized:false,
 request:{type:"manual_correction_approval_request",issueNumber:12,
 prNumber:13,headSha:H,runId:777,attempt:1,maxAttempts:2}};
const digest=x=>createHash("sha256").update(x).digest("hex");
async function fixtures(){
 const pending=new Map(),sessions=new Map();
 const store={putPending:async r=>{pending.set(r.digest,r);return true;},
 consumePending:async d=>{const x=pending.get(d);pending.delete(d);return x;},
 putSession:async r=>{sessions.set(r.digest,r);return true;},
 getSession:async d=>sessions.get(d)};
 const started=await beginLogin({store,now:TIME});
 const login=await finishLogin({store,
  loginCookie:started.setLoginCookie.split(";")[0],state:started.state,
  code:"test-code-value",exchangeCode:async()=>"oauth-user-token-123456789012345",
  serviceReadToken:"separate-service-token-1234567890123",expectedOwnerId:OWNER,
  expectedOwnerLogin:"alphineaiinc",now:TIME+1,
  fetchImpl:async()=>({ok:true,json:async()=>({id:OWNER,login:"alphineaiinc"})})});
 assert.equal(login.verified,true);
 const packet=makeOwnerDecisionPacket({handoff,repositoryId:R,ownerId:OWNER,
  now:TIME});
 let sqls=0;
 const decisionClient={query:async(sql)=>{sqls++;
  if(sql.startsWith("UPDATE"))return {rows:[{request_id:packet.id}]};
  return {rows:[]};
 }};
 return {store,login,packet,decisionClient,get sqls(){return sqls;}};
}
const params=x=>({
 sessionStore:x.store,decisionClient:x.decisionClient,
 cookie:x.login.setCookie.split(";")[0],origin:"https://staging.example.test",
 expectedOrigin:"https://staging.example.test",csrfHeader:x.login.csrfToken,
 method:"POST",packet:x.packet,decision:"approve",repositoryId:R,
 loadFreshHandoff:async()=>structuredClone(handoff),now:TIME+2
});
test("fresh authenticated session and trusted handoff can record intent without dispatch",async()=>{
 const x=await fixtures(),r=await submitOwnerIntent(params(x));
 assert.equal(r.state,"owner_intent_to_review");
 assert.equal(r.agentDispatchAuthorized,false);
 assert.equal(r.mergeAuthorized,false);
 assert.equal(r.deployAuthorized,false);
 assert.equal(r.productionAuthorization,false);
 assert.ok(x.sqls>0);
});
test("CSRF failure, other origin, GET and rejected handoff never reach DB",async()=>{
 const x=await fixtures();
 for(const override of [
  {csrfHeader:"x".repeat(43)},
  {origin:"https://evil.example.test"},
  {method:"GET"},
  {loadFreshHandoff:async()=>({state:"verification_required"})},
  {loadFreshHandoff:async()=>{throw Error("private GitHub failure")}}
 ]){
  const r=await submitOwnerIntent({...params(x),...override});
  assert.equal(r.state,"blocked");assert.equal(r.agentDispatchAuthorized,false);
 }
 assert.equal(x.sqls,0);
});
test("facade cannot accept owner id, handoff or authorization from caller",async()=>{
 const x=await fixtures();
 const r=await submitOwnerIntent({...params(x),actorId:OWNER+1,
  currentHandoff:{state:"request_owner_approval",request:{...handoff.request,
   headSha:"b".repeat(40)}},agentDispatchAuthorized:true});
 assert.equal(r.state,"owner_intent_to_review");
 assert.equal(r.agentDispatchAuthorized,false);
});
