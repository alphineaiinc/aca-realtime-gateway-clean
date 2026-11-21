"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {verifiedRequiredChecks}=require("../src/automation/verifiedCiEvidence");
const sha="a".repeat(40);
const names=["Node tests","PostgreSQL ledger integration"];
const runs=names.map(name=>({name,head_sha:sha,status:"completed",
 conclusion:"success",app:{id:1234}}));
const args={runs,totalCount:2,headSha:sha,requiredNames:names,trustedAppId:1234};
test("accepts complete current-head checks from pinned app",()=>{
 assert.equal(verifiedRequiredChecks(args).length,2);
});
test("rejects missing app pin",()=>{
 assert.equal(verifiedRequiredChecks({...args,trustedAppId:undefined}),null);
});
test("rejects forged check from different app",()=>{
 assert.equal(verifiedRequiredChecks({...args,runs:[runs[0],{...runs[1],app:{id:999}}]}),null);
});
test("rejects stale head and incomplete pagination",()=>{
 assert.equal(verifiedRequiredChecks({...args,runs:[{...runs[0],head_sha:"b".repeat(40)},runs[1]]}),null);
 assert.equal(verifiedRequiredChecks({...args,totalCount:3}),null);
});
test("rejects missing or duplicate required checks",()=>{
 assert.equal(verifiedRequiredChecks({...args,runs:[runs[0]],totalCount:1}),null);
 assert.equal(verifiedRequiredChecks({...args,runs:[runs[0],runs[0]],totalCount:2}),null);
});
