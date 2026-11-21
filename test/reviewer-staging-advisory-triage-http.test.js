"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {once}=require("node:events");
const {startServer}=require("../src/automation/reviewerStagingServer");
const head="a".repeat(40),repoId=1080201236;
const bearer="triage-test-bearer-"+("X".repeat(40));
const base={ACA_REVIEW_REPOSITORY:"alphineaiinc/aca-realtime-gateway-clean",
  ACA_REVIEW_REPOSITORY_ID:String(repoId),ACA_REVIEW_GITHUB_APP_ID:"5858755",
  ACA_REVIEW_GITHUB_INSTALLATION_ID:"184252224",
  ACA_REVIEW_GITHUB_APP_PRIVATE_KEY:"mock-only-not-a-private-key",
  ACA_REVIEW_API_TOKEN:bearer,PORT:"0"};
const scope={repositoryId:repoId,issueNumber:42,prNumber:21,headSha:head};
const pr={number:21,state:"open",changed_files:1,draft:true,
  head:{sha:head,repo:{id:repoId}},base:{sha:"b".repeat(40),repo:{id:repoId}}};
const repo={id:repoId,full_name:"alphineaiinc/aca-realtime-gateway-clean"};
const files=[{filename:"README.md",status:"modified",changes:2,
  patch:"@@ -1 +1 @@\n-old\n+new"}];
function response(data){
 const bytes=Buffer.from(JSON.stringify(data));
 return {ok:true,status:200,headers:{get:k=>k==="content-type"?"application/json":null},
  body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};
}
async function withServer({env=base,changed=false}={},callback){
 let prReads=0,tokenCalls=0;
 const server=startServer(env,{
  githubTokenProvider:async args=>{
   tokenCalls++;
   assert.equal(args.repositoryId,repoId);
   return "mock-installation-token-with-length";
  },
  githubFetch:async(url,options)=>{
   assert.equal(options.method,"GET");
   if(url.includes("/files?"))return response(files);
   if(url.includes("/pulls/"))return response(changed&&++prReads===2?
     {...pr,head:{...pr.head,sha:"c".repeat(40)}}:pr);
   return response(repo);
  }
 });
 try{
  if(!server.listening)await once(server,"listening");
  const url="http://127.0.0.1:"+server.address().port;
  async function post(path="/triage",body=scope,auth=bearer){
   return fetch(url+path,{method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+auth},
    body:JSON.stringify(body)});
  }
  await callback({post,getTokenCalls:()=>tokenCalls});
 }finally{
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 }
}
test("authenticated /triage provides unsigned advisory result without Ed25519 key or reviewer ID",async()=>{
 await withServer({},async({post,getTokenCalls})=>{
  const res=await post();assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.status,"manual_review_required");
  assert.equal(body.independent,false);
  assert.equal(body.signature,undefined);
  assert.equal(getTokenCalls(),1);
  const signing=await post("/review");
  assert.equal(signing.status,503,"triage must not enable signed reviews");
 });
});
test("stale PR and unknown bearer cannot produce advisory success",async()=>{
 await withServer({changed:true},async({post})=>{
  const response=await post();assert.equal(response.status,409);
  const body=await response.json();assert.equal(body.status,"blocked");
  assert.equal(body.independent,false);
 });
 await withServer({},async({post,getTokenCalls})=>{
  assert.equal((await post("/triage",scope,"bad-token")).status,401);
  assert.equal(getTokenCalls(),0);
 });
});
test("missing App key fails closed before token creation",async()=>{
 await withServer({env:{...base,ACA_REVIEW_GITHUB_APP_PRIVATE_KEY:""}},async({post,getTokenCalls})=>{
  const res=await post();
  assert.equal(res.status,503);
  const body=await res.json();
  assert.equal(body.independent,false);
  assert.equal(body.status,"blocked");
  assert.equal(getTokenCalls(),0);
 });
});
