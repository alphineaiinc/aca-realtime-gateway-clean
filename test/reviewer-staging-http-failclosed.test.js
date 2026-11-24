"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {startServer}=require("../src/automation/reviewerStagingServer");
const {once}=require("node:events");
test("staging HTTP service fails closed without reviewer secrets",async()=>{
 const srv=startServer({PORT:"0",ACA_REVIEW_REPOSITORY:"alphineaiinc/aca-realtime-gateway-clean",
 ACA_REVIEW_REPOSITORY_ID:"1080201236",ACA_REVIEW_API_TOKEN:"staging-only-test-token-"+("x".repeat(36))});
 try{
  if(!srv.listening)await once(srv,"listening");
  const url="http://127.0.0.1:"+srv.address().port;
  const health=await fetch(url+"/health");
  assert.equal(health.status,200);
  assert.deepEqual(await health.json(),{status:"up",mode:"fail_closed"});
  const req={method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({repositoryId:1080201236,issueNumber:20,prNumber:21,headSha:"a".repeat(40)})};
  const denied=await fetch(url+"/review",req);
  assert.equal(denied.status,401);
  const invalid=await fetch(url+"/review",{...req,headers:{...req.headers,
   Authorization:"Bearer staging-only-test-token-"+("x".repeat(36))}});
  assert.equal(invalid.status,503);
  assert.equal((await invalid.json()).error,"reviewer_not_configured");
  const wrongPath=await fetch(url+"/not-a-review",{method:"POST"});
  assert.equal(wrongPath.status,404);
 }finally{await new Promise((resolve,reject)=>srv.close(err=>err?reject(err):resolve()));}
});

test("authenticated reviewer request budget rejects excess requests without affecting health",async()=>{
 const token="fixture-token-"+"x".repeat(36);
 const srv=startServer({PORT:"0",ACA_REVIEW_API_TOKEN:token});
 try{
  if(!srv.listening)await once(srv,"listening");
  const url="http://127.0.0.1:"+srv.address().port;
  const req={method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:"{}"};
  for(let i=0;i<30;i++){const r=await fetch(url+"/review",req);assert.equal(r.status,503);await r.json();}
  const denied=await fetch(url+"/review",req);
  assert.equal(denied.status,429);
  assert.equal(denied.headers.get("retry-after"),"60");
  assert.equal((await denied.json()).error,"reviewer_busy");
  assert.equal((await fetch(url+"/health")).status,200);
 }finally{await new Promise((resolve,reject)=>srv.close(err=>err?reject(err):resolve()));}
});
