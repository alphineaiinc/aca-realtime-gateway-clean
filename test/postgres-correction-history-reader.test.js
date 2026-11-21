"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {readCorrectionHistory}=require("../src/automation/postgresCorrectionHistoryReader");
const id={repositoryId:1,issueNumber:20,prNumber:21};
const a="a".repeat(40),b="b".repeat(40);
const event={sequence:1,prior_head_sha:a,resulting_head_sha:b,
 failure_fingerprint:"ci:failure:first",event_id:"123e4567-e89b-42d3-a456-426614174000",
 trusted_actor_id:"123"};
function fake(header,events){
 const queries=[];
 return {queries,client:{query:async(sql)=>{queries.push(sql);
 if(sql.includes("SELECT version"))return {rows:header};
 if(sql.includes("SELECT sequence"))return {rows:events};
 return {rows:[]};}}};
}
test("authenticated adapter reads consistent single-event ledger",async()=>{
 const {client,queries}=fake([{version:1}],[event]);
 assert.deepEqual(await readCorrectionHistory(client,id),{
 attempts:1,unchangedFailureCount:0,lastResultingHeadSha:b,
 lastFailureFingerprint:"ci:failure:first"});
 assert.match(queries[0],/REPEATABLE READ READ ONLY/);
 assert.equal(queries.at(-1),"COMMIT");
});
test("missing initialization fails closed and rolls back",async()=>{
 const {client,queries}=fake([],[]);
 await assert.rejects(readCorrectionHistory(client,id),/uninitialized_or_ambiguous_ledger/);
 assert.equal(queries.at(-1),"ROLLBACK");
});
test("version mismatch fails closed",async()=>{
 const {client}=fake([{version:2}],[event]);
 await assert.rejects(readCorrectionHistory(client,id),/corrupt_ledger_history/);
});
test("invalid event chain fails closed",async()=>{
 const {client}=fake([{version:1}],[{...event,prior_head_sha:b,resulting_head_sha:b}]);
 await assert.rejects(readCorrectionHistory(client,id),/corrupt_ledger_history/);
});
test("fresh initialized ledger is distinguishable from missing",async()=>{
 const {client}=fake([{version:0}],[]);
 assert.deepEqual(await readCorrectionHistory(client,id),{
 attempts:0,unchangedFailureCount:0,lastResultingHeadSha:null,
 lastFailureFingerprint:null});
});
test("invalid identity cannot start a transaction",async()=>{
 const {client,queries}=fake([{version:0}],[]);
 await assert.rejects(readCorrectionHistory(client,{...id,repositoryId:0}),/invalid_ledger_read_arguments/);
 assert.equal(queries.length,0);
});
