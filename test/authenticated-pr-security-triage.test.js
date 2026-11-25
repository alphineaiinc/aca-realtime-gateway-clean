"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {inspectAuthenticatedPr}=require("../src/automation/authenticatedPrSecurityTriage");
const head="a".repeat(40),base="b".repeat(40);
const repositoryId=1080201236,prNumber=21;
const scope={owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",repositoryId,prNumber,headSha:head};
const file={filename:"README.md",status:"modified",changes:2,patch:"@@ -1 +1 @@\n-old\n+new"};
const pr={number:21,state:"open",draft:true,changed_files:1,
 head:{sha:head,repo:{id:repositoryId}},base:{sha:base,repo:{id:repositoryId}}};
function mock({repository={id:repositoryId,full_name:"alphineaiinc/aca-realtime-gateway-clean"},
 first=pr,second=first,files=[file],throwOn=null}={}){
 let reads=0;const calls=[];
 const run=(kind,data)=>async args=>{calls.push({kind,args});if(throwOn===kind)throw Error("api_down");return {data};};
 return {calls,github:{rest:{
  repos:{get:run("repo",repository)},
  pulls:{get:async args=>{calls.push({kind:"pull",args});if(throwOn==="pull")throw Error("api_down");return {data:++reads===1?first:second};},
  listFiles:run("files",files)}
 }}};
}
test("authenticated complete patch evidence yields advisory-only manual review",async()=>{
 const m=mock();const result=await inspectAuthenticatedPr({github:m.github,...scope});
 assert.equal(result.status,"manual_review_required");
 assert.equal(result.independent,false);
 assert.equal(result.filesInspected,1);
 assert.deepEqual(m.calls.map(c=>c.kind),["repo","pull","files","pull"]);
 assert.equal(m.calls[2].args.per_page,100);
});
test("security findings never authorize approval",async()=>{
 const m=mock({files:[{...file,filename:"src/automation/reviewer.js"}]});
 const result=await inspectAuthenticatedPr({github:m.github,...scope});
 assert.equal(result.status,"findings");
 assert.equal(result.independent,false);
});
test("reject repository spoof, fork, stale head, changed base and oversized PR",async()=>{
 const cases=[
  {repository:{id:999,full_name:"alphineaiinc/aca-realtime-gateway-clean"}},
  {first:{...pr,head:{...pr.head,repo:{id:999}}}},
  {first:{...pr,head:{...pr.head,sha:"c".repeat(40)}}},
  {first:{...pr,changed_files:101}},
  {second:{...pr,base:{...pr.base,sha:"c".repeat(40)}}},
  {second:{...pr,head:{...pr.head,sha:"c".repeat(40)}}}
 ];
 for(const c of cases){
  const m=mock(c);
  const result=await inspectAuthenticatedPr({github:m.github,...scope});
  assert.equal(result.status,"blocked");
  assert.equal(result.independent,false);
 }
});
test("reject file count mismatch, duplicate file records, missing patches and API outage",async()=>{
 for(const c of [
  {files:[]},
  {first:{...pr,changed_files:2},files:[file,file]},
  {files:[{...file,patch:undefined}]},
  {throwOn:"files"},
  {throwOn:"pull"},
  {throwOn:"repo"}
 ]){
  const m=mock(c);
  const result=await inspectAuthenticatedPr({github:m.github,...scope});
  assert.equal(result.status,"blocked");
  assert.equal(result.independent,false);
 }
});
test("invalid scopes cannot call GitHub",async()=>{
 const m=mock();
 const result=await inspectAuthenticatedPr({github:m.github,...scope,headSha:"not-a-sha"});
 assert.equal(result.status,"blocked");
 assert.equal(m.calls.length,0);
});
