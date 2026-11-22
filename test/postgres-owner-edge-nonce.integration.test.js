"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {Pool}=require("pg");
const {randomBytes}=require("node:crypto");
const {createOwnerEdgeNonceStore}=require("../src/automation/phase2aOwnerEdgeNonceStore");
if(!process.env.ACA_TEST_DATABASE_URL){
 test("owner proof nonce PostgreSQL requires disposable ACA_TEST_DATABASE_URL",{skip:true},()=>{});
}else{
 test("real PostgreSQL: one nonce claim wins across instances; role cannot read or mutate",async()=>{
  const admin=new Pool({connectionString:process.env.ACA_TEST_DATABASE_URL,max:2});
  let a,b;
  try{
   await admin.query(fs.readFileSync(path.join(__dirname,
    "../migrations/aca_phase2a_owner_edge_nonce_staging.sql"),"utf8"));
   await admin.query(`DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aca_ci_edge_writer') THEN
     CREATE ROLE aca_ci_edge_writer LOGIN PASSWORD 'aca_ci_fixture_only'
      IN ROLE aca_owner_edge_nonce_writer;
    END IF;
   END $$`);
   const connect=()=>{const url=new URL(process.env.ACA_TEST_DATABASE_URL);
    url.username="aca_ci_edge_writer";url.password="aca_ci_fixture_only";
    return new Pool({connectionString:url.toString(),max:2});};
   a=connect();b=connect();
   const first=createOwnerEdgeNonceStore({pool:a});
   const second=createOwnerEdgeNonceStore({pool:b});
   const nonce=randomBytes(32).toString("base64url"),expiresAt=Date.now()+30000;
   const results=await Promise.all([
    first.claimOnce({nonce,expiresAt,repositoryId:1080201236}),
    second.claimOnce({nonce,expiresAt,repositoryId:1080201236})
   ]);
   assert.deepEqual(results.sort(),[false,true]);
   assert.equal(await first.claimOnce({nonce,expiresAt,repositoryId:1080201236}),false);
   assert.equal(await first.claimOnce({nonce:randomBytes(32).toString("base64url"),
    expiresAt:Date.now()-1000,repositoryId:1080201236}),false);
   await assert.rejects(a.query("SELECT * FROM aca_automation.owner_edge_proof_nonces"),/permission denied/);
   await assert.rejects(a.query("DELETE FROM aca_automation.owner_edge_proof_nonces"),/permission denied/);
   await assert.rejects(a.query("UPDATE aca_automation.owner_edge_proof_nonces SET repository_id=1"),/permission denied/);
  }finally{
   await Promise.allSettled([a?.end(),b?.end()]);
   await admin.end();
  }
 });
}
