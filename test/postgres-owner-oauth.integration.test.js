"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {randomBytes,createHash}=require("node:crypto");
const {Pool}=require("pg");
const {createPostgresOAuthStore}=
 require("../src/automation/phase2aPostgresOAuthStore");
const hash=s=>createHash("sha256").update(s).digest("hex");
if(!process.env.ACA_TEST_DATABASE_URL){
 test("Postgres OAuth storage requires isolated ACA_TEST_DATABASE_URL",{skip:true},()=>{});
}else{
 test("real Postgres: encrypted PKCE, atomic consume, RLS and session revocation",async()=>{
  const admin=new Pool({connectionString:process.env.ACA_TEST_DATABASE_URL,max:2});
  let a,b,reader;
  try{
   await admin.query(fs.readFileSync(path.join(__dirname,
    "../migrations/aca_phase2a_owner_oauth_store_staging.sql"),"utf8"));
   await admin.query(`DO $$
    BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aca_ci_oauth_a') THEN
      CREATE ROLE aca_ci_oauth_a LOGIN PASSWORD 'aca_ci_test_only' IN ROLE aca_owner_oauth_store;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aca_ci_oauth_reader') THEN
      CREATE ROLE aca_ci_oauth_reader LOGIN PASSWORD 'aca_ci_test_only';
     END IF;
    END $$`);
   const connect=user=>{const url=new URL(process.env.ACA_TEST_DATABASE_URL);
    url.username=user;url.password="aca_ci_test_only";
    return new Pool({connectionString:url.toString(),max:3});};
   a=connect("aca_ci_oauth_a");b=connect("aca_ci_oauth_a");
   reader=connect("aca_ci_oauth_reader");
   const key=randomBytes(32),wrongKey=randomBytes(32);
   const first=createPostgresOAuthStore({pool:a,encryptionKey:key});
   const second=createPostgresOAuthStore({pool:b,encryptionKey:key});
   const now=Date.now(),d=hash("oauth-once-"+randomBytes(8).toString("hex"));
   const stateDigest=hash("oauth-state");
   const pending={digest:d,stateDigest,verifier:"V".repeat(50),
    createdAt:now,expiresAt:now+300000};
   assert.equal(await first.putPending(pending),true);
   assert.equal(await first.putPending(pending),false);
   const encrypted=await a.query(`SELECT encrypted_verifier FROM
    aca_automation.owner_oauth_pending WHERE digest=$1`,[d]);
   assert.equal(encrypted.rows.length,1);
   assert.equal(encrypted.rows[0].encrypted_verifier.includes(pending.verifier),false);
   await assert.rejects(reader.query("SELECT digest FROM aca_automation.owner_oauth_pending"),/permission denied/);
   const [ra,rb]=await Promise.all([first.consumePending(d),second.consumePending(d)]);
   assert.equal([ra,rb].filter(Boolean).length,1);
   assert.equal((ra||rb).verifier,pending.verifier);
   assert.equal(await first.consumePending(d),null);
   const d2=hash("oauth-badkey-"+randomBytes(8).toString("hex"));
   await first.putPending({...pending,digest:d2});
   await assert.rejects(
    createPostgresOAuthStore({pool:b,encryptionKey:wrongKey}).consumePending(d2));
   assert.equal(await first.consumePending(d2),null);
   const sid=hash("session-"+randomBytes(8).toString("hex"));
   const session={digest:sid,csrfDigest:hash("secret-csrf"),
    ownerId:230486228,createdAt:now,expiresAt:now+900000};
   assert.equal(await first.putSession(session),true);
   assert.equal(await second.putSession(session),false);
   assert.equal((await second.getSession(sid)).ownerId,session.ownerId);
   assert.equal(await first.revokeSession(sid),true);
   assert.equal(await second.getSession(sid),null);
   assert.equal(await second.revokeSession(sid),false);
   await assert.rejects(a.query("UPDATE aca_automation.owner_oauth_sessions SET owner_id=2"),/permission denied/);
   await assert.rejects(reader.query("DELETE FROM aca_automation.owner_oauth_sessions"),/permission denied/);
  }finally{
   await Promise.allSettled([a?.end(),b?.end(),reader?.end()]);
   await admin.end();
  }
 });
}
