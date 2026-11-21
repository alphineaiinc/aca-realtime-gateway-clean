"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {Readable}=require("node:stream");
const {handlePrivateOwnerHttp}=require("../src/automation/phase2aPrivateOwnerHttp");
function fake({url="/phase2a/internal/owner-intent",method="POST",type="application/json",
 body='{}',trusted=true}={}){
 const req=Readable.from([body]);req.url=url;req.method=method;
 req.headers={"content-type":type};req.trusted=trusted;
 let status,headers,payload;
 const res={writeHead:(s,h)=>{status=s;headers=h;},end:x=>{payload=JSON.parse(x);}};
 return {req,res,result:()=>({status,headers,payload})};
}
const verifyTransport=req=>req.trusted===true;
function safe(result){
 for(const k of ["agentDispatchAuthorized","dispatched","mergeAuthorized",
 "deployAuthorized","signingAuthorized","productionAuthorization"])
 assert.equal(result.payload[k],false,k);
 assert.equal(result.headers["Cache-Control"],"no-store");
}
test("private HTTP adapter rejects unauthenticated transport before reading payload",async()=>{
 const x=fake({trusted:false,body:"not json"});
 await handlePrivateOwnerHttp(x.req,x.res,{verifyTransport});
 assert.equal(x.result().status,403);safe(x.result());
});
test("private HTTP adapter denies invalid routes, verbs, media types, and oversized bodies",async()=>{
 for(const v of [{url:"/untrusted"},{method:"GET"},{type:"text/plain"},
  {body:"x".repeat(5000)},{body:"[]"},
  {body:JSON.stringify({decision:"approve",requestId:"x",proof:{},agentDispatchAuthorized:true})}]){
  const x=fake(v);
  await handlePrivateOwnerHttp(x.req,x.res,{verifyTransport});
  assert.notEqual(x.result().status,200);safe(x.result());
 }
});
test("private HTTP adapter fails closed without trusted dependencies",async()=>{
 const x=fake({body:JSON.stringify({decision:"approve",requestId:"a".repeat(64),proof:{}})});
 await handlePrivateOwnerHttp(x.req,x.res,{verifyTransport});
 assert.equal(x.result().status,409);safe(x.result());
});
test("missing transport verifier cannot be bypassed by request flags",async()=>{
 const x=fake({trusted:true});
 await handlePrivateOwnerHttp(x.req,x.res,{});
 assert.equal(x.result().status,403);safe(x.result());
});
