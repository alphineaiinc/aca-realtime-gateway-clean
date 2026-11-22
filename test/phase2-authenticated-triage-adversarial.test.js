"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {inspectAuthenticatedPr}=require("../src/automation/authenticatedPrSecurityTriage");
const {inspectPrPatches}=require("../src/automation/prSecurityPatchTriage");
const repositoryId=1080201236,prNumber=107,headSha="a".repeat(40);
const baseSha="b".repeat(40);
const repo={id:repositoryId,full_name:"alphineaiinc/aca-realtime-gateway-clean"};
const pr={number:prNumber,state:"open",draft:false,changed_files:1,
  head:{sha:headSha,repo:{id:repositoryId}},
  base:{sha:baseSha,repo:{id:repositoryId}}};
const cleanFile={filename:"docs/fixture.md",status:"modified",changes:2,
  additions:1,deletions:1,patch:"@@ -1 +1 @@\n-old\n+new"};
const scope={owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",repositoryId,prNumber,headSha};
function client({before=pr,after=before,files=[cleanFile],repository=repo}={}){
 let reads=0;
 return {rest:{repos:{get:async()=>({data:repository})},
  pulls:{get:async()=>({data:++reads===1?before:after}),
    listFiles:async()=>({data:files})}}};
}
test("eligible current-head PR is advisory only, never independent approval",async()=>{
 const result=await inspectAuthenticatedPr({github:client(),...scope});
 assert.equal(result.status,"manual_review_required");
 assert.equal(result.independent,false);
 assert.equal(result.signature,undefined);
 assert.equal(result.filesInspected,1);
});
test("stale SHA fails closed while draft PR remains unsigned advisory",async()=>{
 for(const before of [{...pr,head:{...pr.head,sha:"c".repeat(40)}}]){
  const result=await inspectAuthenticatedPr({github:client({before}),...scope});
  assert.equal(result.status,"blocked");
  assert.equal(result.reason,"stale_or_unsupported_pr");
  assert.equal(result.independent,false);
 }
 const draft=await inspectAuthenticatedPr({github:client({before:{...pr,draft:true}}),...scope});
 assert.equal(draft.status,"manual_review_required");
 assert.equal(draft.independent,false);
 assert.equal(draft.signature,undefined);
});
test("head or base changing during inspection fails closed",async()=>{
 for(const after of [{...pr,head:{...pr.head,sha:"c".repeat(40)}},
   {...pr,base:{...pr.base,sha:"d".repeat(40)}}]){
  const result=await inspectAuthenticatedPr({github:client({after}),...scope});
  assert.equal(result.status,"blocked");
  assert.equal(result.reason,"pr_changed_during_triage");
 }
});
test("missing or duplicate GitHub file evidence fails closed",async()=>{
 for(const files of [[],[cleanFile,cleanFile]]){
  const result=await inspectAuthenticatedPr({github:client({files}),...scope});
  assert.equal(result.status,"blocked");
  assert.equal(result.reason,"incomplete_or_duplicate_file_evidence");
 }
});
test("security-sensitive patch reports findings without signing",async()=>{
 const sensitive={filename:"src/automation/guard.js",status:"modified",changes:2,
  additions:1,deletions:1,patch:"@@ -1 +1 @@\n-safe\n+const x = eval(input)"};
 const result=await inspectAuthenticatedPr({github:client({files:[sensitive]}),...scope});
 assert.equal(result.status,"findings");
 assert.equal(result.independent,false);
 assert.equal(result.signature,undefined);
 assert.ok(result.findings.some(f=>f.rule==="process-execution"&&f.severity==="high"));
 assert.ok(result.findings.some(f=>f.rule==="sensitive_surface_requires_independent_review"));
});
test("truncated unified patch cannot yield a positive advisory",()=>{
 const result=inspectPrPatches({repositoryId,prNumber,headSha,files:[{
  ...cleanFile,patch:"@@ -1 +1 @@\n-old"}]});
 assert.equal(result.status,"blocked");
 assert.equal(result.reason,"incomplete_unified_patch");
});
