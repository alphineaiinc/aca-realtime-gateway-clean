"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createGithubReadClient,inspectWithGithubApp}=require("../src/automation/githubAppPrTriage");
const head="a".repeat(40),base="b".repeat(40),repositoryId=1080201236;
const repo={id:repositoryId,full_name:"alphineaiinc/aca-realtime-gateway-clean"};
const pr={number:21,state:"open",draft:true,changed_files:1,
 head:{sha:head,repo:{id:repositoryId}},base:{sha:base,repo:{id:repositoryId}}};
const files=[{filename:"README.md",status:"modified",changes:2,patch:"@@ -1 +1 @@\n-old\n+new"}];
const scope={appId:5858755,installationId:184252224,privateKey:"mock-private-not-real",
  repositoryId,owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",prNumber:21,headSha:head};
const token="test-read-only-installation-token-12345";
function response(data,{status=200,contentType="application/json",length}={}){
 const payload=Buffer.from(JSON.stringify(data));
 return {status,ok:status===200,headers:{get:k=>k==="content-type"?contentType:k==="content-length"?length:null},
 body:new ReadableStream({start(c){c.enqueue(payload);c.close();}})};
}
function transport({changed=false,missingFiles=false,failed=false,oversized=false}={}){
 const urls=[];let reads=0;
 return {urls,fetchImpl:async(url,options)=>{
   urls.push(url);assert.equal(options.method,"GET");
   assert.equal(options.redirect,"error");
   assert.equal(options.headers.Authorization,"Bearer "+token);
   if(failed)throw Error("github down");
   if(url.includes("/files?"))return response(missingFiles?[]:files,oversized?{length:"999999999"}:{});
   if(url.includes("/pulls/"))return response(++reads===2&&changed?{...pr,head:{...pr.head,sha:"c".repeat(40)}}:pr);
   return response(repo);
 }};
}
test("read-only App credential fetches repository, PR, file page, and rechecks head",async()=>{
 const t=transport();
 const result=await inspectWithGithubApp({...scope,fetchImpl:t.fetchImpl,
  installationTokenProvider:async args=>{
   assert.deepEqual(args,{appId:5858755,installationId:184252224,
     privateKey:"mock-private-not-real",repositoryId});
   return token;
  }});
 assert.equal(result.status,"manual_review_required");
 assert.equal(result.independent,false);
 assert.equal(t.urls.length,4);
 assert.ok(t.urls[2].endsWith("/pulls/21/files?per_page=100&page=1"));
});
test("incomplete evidence, changed head, API outage and huge responses block",async()=>{
 for(const options of [{changed:true},{missingFiles:true},{failed:true},{oversized:true}]){
   const t=transport(options);
   const result=await inspectWithGithubApp({...scope,fetchImpl:t.fetchImpl,
     installationTokenProvider:async()=>token});
   assert.equal(result.status,"blocked");
   assert.equal(result.independent,false);
 }
});
test("missing App token, invalid repository and transport failures deny access",async()=>{
 const missing=await inspectWithGithubApp(scope);
 assert.equal(missing.status,"blocked");
 assert.throws(()=>createGithubReadClient({token:"short"}),/invalid_triage_transport_configuration/);
 const t=transport();
 const result=await inspectWithGithubApp({...scope,owner:"owner/evil",
   fetchImpl:t.fetchImpl,installationTokenProvider:async()=>token});
 assert.equal(result.status,"blocked");
 assert.equal(t.urls.length,0);
});
