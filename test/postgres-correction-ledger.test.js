"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {appendCorrection}=require("../src/automation/postgresCorrectionLedger");
const claim={repositoryId:1,issueNumber:20,prNumber:21,actorId:123,
 eventId:"123e4567-e89b-42d3-a456-426614174000",
 priorHeadSha:"a".repeat(40),resultingHeadSha:"b".repeat(40),
 failureFingerprint:"ci:node-tests:failure"};
function fake(version=0,last=null){
 const calls=[];
 const client={query:async(sql,args)=>{calls.push({sql,args});
 if(sql.includes("SELECT version"))return {rows:[{version}]};
 if(sql.includes("SELECT sequence"))return {rows:last?[last]:[]};
 return {rows:[]};}};
 return {client,calls};
}
test("first attempt is transactionally recorded",async()=>{
 const {client,calls}=fake();
 assert.deepEqual(await appendCorrection(client,claim),{attempts:1,remaining:1});
 assert.equal(calls.at(-1).sql,"COMMIT");
 assert.ok(calls.some(x=>x.sql.includes("FOR UPDATE")));
});
test("second attempt consumes remaining budget",async()=>{
 const {client}=fake(1,{sequence:1,resulting_head_sha:claim.priorHeadSha,
 failure_fingerprint:"ci:prior:failure"});
 assert.deepEqual(await appendCorrection(client,claim),{attempts:2,remaining:0});
});
test("exhausted budget rolls back",async()=>{
 const {client,calls}=fake(2);
 await assert.rejects(appendCorrection(client,claim),/correction_budget_exhausted/);
 assert.equal(calls.at(-1).sql,"ROLLBACK");
});
test("unchanged failure rolls back",async()=>{
 const {client,calls}=fake(1,{sequence:1,resulting_head_sha:claim.priorHeadSha,
 failure_fingerprint:claim.failureFingerprint});
 await assert.rejects(appendCorrection(client,claim),/stale_head_or_unchanged_failure/);
 assert.equal(calls.at(-1).sql,"ROLLBACK");
});
test("invalid identity never starts transaction",async()=>{
 const {client,calls}=fake();
 await assert.rejects(appendCorrection(client,{...claim,actorId:0}),/invalid_correction_claim/);
 assert.equal(calls.length,0);
});
test("corrupt history fails closed",async()=>{
 const {client,calls}=fake(1,null);
 await assert.rejects(appendCorrection(client,claim),/corrupt_ledger/);
 assert.equal(calls.at(-1).sql,"ROLLBACK");
});
