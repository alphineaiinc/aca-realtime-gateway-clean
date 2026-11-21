"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {inspectPrPatches}=require("../src/automation/prSecurityPatchTriage");
const base={repositoryId:1080201236,prNumber:21,headSha:"a".repeat(40)};
const file=(filename,patch,status="modified")=>({filename,status,changes:2,patch});
test("benign patch can only request manual review, never produce independent approval",()=>{
 const result=inspectPrPatches({...base,files:[file("README.md","@@ -1 +1 @@\n-old\n+new")]});
 assert.equal(result.status,"manual_review_required");
 assert.equal(result.independent,false);
 assert.equal(result.findings.length,0);
 assert.match(result.patchDigest,/^[a-f0-9]{64}$/);
});
test("security-sensitive code requires independent review even without suspicious tokens",()=>{
 const result=inspectPrPatches({...base,files:[file("src/automation/reviewer.js","@@ -1 +1 @@\n-old\n+const allowed = false;")]});
 assert.equal(result.status,"findings");
 assert.equal(result.independent,false);
 assert.ok(result.findings.some(f=>f.rule==="sensitive_surface_requires_independent_review"));
});
test("detects added private keys, write authorities and unsafe bypasses",()=>{
 const result=inspectPrPatches({...base,files:[
 file("config/security.yml","@@ -0,0 +1 @@\n+-----BEGIN PRIVATE KEY-----"),
 file(".github/workflows/ci.yml","@@ -1 +1 @@\n-read-all\n+permissions: write-all"),
 file("src/automation/policy.js","@@ -1 +1 @@\n-mergeAuthorized: false\n+mergeAuthorized: true"),
 file("src/automation/http.js","@@ -1 +1 @@\n-old\n+rejectUnauthorized: false")
 ]});
 assert.equal(result.status,"findings");
 assert.ok(result.findings.some(f=>f.rule==="secret-material"));
 assert.ok(result.findings.some(f=>f.rule==="weakened-github-authorization"));
 assert.ok(result.findings.some(f=>f.rule==="security-override"));
 assert.ok(result.findings.some(f=>f.rule==="untrusted-network"));
});
test("deleted files and omitted or ambiguous patches never pass",()=>{
 const deleted=inspectPrPatches({...base,files:[file("README.md","", "removed")]});
 assert.equal(deleted.status,"findings");
 const incomplete=inspectPrPatches({...base,files:[file("src/automation/trust.js","")]});
 assert.equal(incomplete.status,"blocked");
 assert.equal(incomplete.independent,false);
 const overflow=inspectPrPatches({...base,files:Array(101).fill(file("x.txt","@@ -1 +1 @@\n-old\n+new"))});
 assert.equal(overflow.status,"blocked");
 assert.equal(inspectPrPatches({...base,headSha:"bad",files:[file("a","@@ -1 +1 @@\n-x\n+y")]}).status,"blocked");
});
test("patch digest is independent of file order and does not include removed-line hints as new findings",()=>{
 const a=file("safe-a.txt","@@ -1 +1 @@\n------BEGIN PRIVATE KEY-----\n+safe");
 const b=file("safe-b.txt","@@ -1 +1 @@\n-old\n+new");
 const first=inspectPrPatches({...base,files:[a,b]});
 const second=inspectPrPatches({...base,files:[b,a]});
 assert.equal(first.patchDigest,second.patchDigest);
 assert.equal(first.status,"manual_review_required");
});

test("truncated hunk and malformed hunk header fail closed",()=>{
 const truncated=file("README.md","@@ -1,3 +1,3 @@\n-old\n+new");
 const bogus=file("README.md","@@ bad header @@\n-old\n+new");
 for(const changed of [truncated,bogus]){
  const result=inspectPrPatches({...base,files:[changed]});
  assert.equal(result.status,"blocked");
  assert.equal(result.independent,false);
 }
});
test("complete multi-hunk patch remains advisory and never signs",()=>{
 const patch="@@ -1 +1 @@\n-old\n+new\n@@ -9,2 +9,2 @@\n context\n-wrong\n+right";
 const result=inspectPrPatches({...base,files:[file("README.md",patch)]});
 assert.equal(result.status,"manual_review_required");
 assert.equal(result.independent,false);
});
