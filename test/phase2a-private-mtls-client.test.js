"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {EventEmitter}=require("node:events");
const {createPrivateMtlsClient}=require("../src/automation/phase2aPrivateMtlsClient");
const FP="AB:".repeat(31)+"AB";
const options={hostname:"aca-owner-internal",port:8443,
 serverCa:"-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----",
 clientCert:"-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----",
 clientKey:"-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----",
 serverFingerprint256:FP};
function proof(requestId="a".repeat(64),decision="approve"){
 return {version:"aca-owner-edge-proof-v1",issuer:"aca-public-edge",
 audience:"aca-private-owner",repositoryId:1080201236,ownerId:230486228,
 requestId,decision,issuedAt:1700000000000,expiresAt:1700000060000,
 nonce:"n".repeat(43),signature:"s".repeat(86)};
}
function fakeRequest(status=200,response={state:"owner_intent_to_review",
 agentDispatchAuthorized:false,mergeAuthorized:false,deployAuthorized:false}){
 const seen=[];
 const requestImpl=(opts,handler)=>{
  seen.push(opts);
  const req=new EventEmitter();
  req.end=body=>{
   seen.push(body);
   const res=new EventEmitter();
   res.statusCode=status;
   handler(res);
   process.nextTick(()=>{res.emit("data",Buffer.from(JSON.stringify(response)));res.emit("end");});
  };
  req.destroy=err=>req.emit("error",err);
  return req;
 };
 return {requestImpl,seen};
}
test("private-client request never carries cookies, OAuth tokens, forwarded headers or operational authority",async()=>{
 const f=fakeRequest(),client=createPrivateMtlsClient({...options,requestImpl:f.requestImpl});
 const result=await client.sendAdvisory({body:{decision:"approve",requestId:"a".repeat(64),proof:proof()}});
 assert.equal(result.state,"owner_intent_to_review");
 assert.equal(result.agentDispatchAuthorized,false);
 const req=f.seen[0];
 assert.equal(req.hostname,options.hostname);
 assert.equal(req.method,"POST");
 assert.equal(req.rejectUnauthorized,true);
 assert.equal(req.servername,options.hostname);
 assert.equal(req.cert,options.clientCert);
 assert.equal(req.key,options.clientKey);
 assert.equal(req.headers.Cookie,undefined);
 assert.equal(req.headers.Authorization,undefined);
 assert.equal(req.headers["X-Forwarded-Proto"],undefined);
 assert.deepEqual(JSON.parse(f.seen[1]),{decision:"approve",requestId:"a".repeat(64),proof:proof()});
});
test("reject external hostnames, unsafe payloads and URLs before network call",async()=>{
 for(const hostname of ["github.com","staging.example.test",
  "127.0.0.1","evil.com","http://abc","abc:8443","a/b"]){
  assert.throws(()=>createPrivateMtlsClient({...options,hostname}),/not_configured/);
 }
 const f=fakeRequest(),client=createPrivateMtlsClient({...options,requestImpl:f.requestImpl});
 for(const body of [
  {decision:"approve",requestId:"a".repeat(64),ownerId:22},
  {decision:"approve",requestId:"a".repeat(64),agentDispatchAuthorized:true},
  {decision:"execute",requestId:"a".repeat(64)},
  {decision:"approve",requestId:"short"},
  {decision:"approve",requestId:"a".repeat(64),proof:proof("b".repeat(64))},
  {decision:"approve",requestId:"a".repeat(64)}]){
  await assert.rejects(client.sendAdvisory({body}),/invalid_private_request/);
 }
 assert.equal(f.seen.length,0);
});
test("private response cannot grant merge, deployment or execution",async()=>{
 for(const response of [
  {state:"owner_intent_to_review",agentDispatchAuthorized:true,
    mergeAuthorized:false,deployAuthorized:false},
  {state:"dispatched",agentDispatchAuthorized:false,
    mergeAuthorized:false,deployAuthorized:false},
  {state:"owner_intent_to_review",agentDispatchAuthorized:false,
    mergeAuthorized:true,deployAuthorized:false}
 ]){
  const f=fakeRequest(200,response);
  const client=createPrivateMtlsClient({...options,requestImpl:f.requestImpl});
  await assert.rejects(client.sendAdvisory({body:{decision:"reject",requestId:"b".repeat(64),proof:proof("b".repeat(64),"reject")}}),
   /untrusted_private_response/);
 }
 const denied=fakeRequest(403,{state:"blocked"});
 await assert.rejects(createPrivateMtlsClient({...options,requestImpl:denied.requestImpl})
  .sendAdvisory({body:{decision:"reject",requestId:"b".repeat(64),proof:proof("b".repeat(64),"reject")}}),
 /private_request_blocked/);
});
