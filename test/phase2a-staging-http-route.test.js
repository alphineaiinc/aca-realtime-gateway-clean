"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {startServer}=require("../src/automation/reviewerStagingServer");
const token="phase2a-local-test-bearer-token-0123456789";
function start(env){
 return new Promise((resolve,reject)=>{
  const server=startServer({PORT:"0",ACA_REVIEW_REPOSITORY:"alphineaiinc/aca-realtime-gateway-clean",
   ACA_REVIEW_REPOSITORY_ID:"1080201236",ACA_PHASE2A_WORKFLOW_ID:"422174901",
   ACA_PHASE2A_LEDGER_ROLE:"aca_p2_reader_a",
   ACA_PHASE2A_API_TOKEN:token,...env});
  if(server.listening)resolve(server);
  else {server.once("listening",()=>resolve(server));server.once("error",reject);}
 });
}
async function request(server,auth){
 const response=await fetch("http://127.0.0.1:"+server.address().port+"/phase2a/correction-request",{
  method:"POST",headers:{"content-type":"application/json",...(auth?{authorization:auth}:{})},
  body:JSON.stringify({runId:123})
 });
 return {status:response.status,body:await response.json()};
}
test("staging correction HTTP route is disabled by default, regardless of bearer token",async()=>{
 const server=await start({});
 try{
  const x=await request(server,"Bearer "+token);
  assert.equal(x.status,401);
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
test("staging correction HTTP route has separate token and requires injected clients",async()=>{
 const server=await start({ACA_PHASE2A_ENABLED:"true"});
 try{
  assert.equal((await request(server,null)).status,401);
  assert.equal((await request(server,"Bearer wrong")).status,401);
  const x=await request(server,"Bearer "+token);
  assert.equal(x.status,503);
  assert.equal(x.body.error,"github_client_unavailable");
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
