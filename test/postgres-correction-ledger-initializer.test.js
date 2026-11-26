"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {initializeCorrectionLedger}=require("../src/automation/postgresCorrectionLedgerInitializer");
const scope={repositoryId:42,issueNumber:20,prNumber:21};
const auth={verifiedHeadSha:"a".repeat(40),authenticatedInitializer:true};
function fake(rows){const calls=[];return {calls,client:{query:async(sql)=>{calls.push(sql);return {rows:sql.includes("RETURNING version")?rows:[]};}}};}
test("explicit initialization commits once",async()=>{
 const {client,calls}=fake([{version:0}]);
 assert.equal((await initializeCorrectionLedger(client,scope,auth)).initialized,true);
 assert.equal(calls.at(-1),"COMMIT");
});
test("reinitialization fails closed and rolls back",async()=>{
 const {client,calls}=fake([]);
 await assert.rejects(initializeCorrectionLedger(client,scope,auth),/ledger_already_initialized/);
 assert.equal(calls.at(-1),"ROLLBACK");
});
test("unverified caller cannot initialize",async()=>{
 const {client,calls}=fake([{version:0}]);
 await assert.rejects(initializeCorrectionLedger(client,scope,{...auth,authenticatedInitializer:false}),/unverified_ledger_initialization/);
 assert.equal(calls.length,0);
});
