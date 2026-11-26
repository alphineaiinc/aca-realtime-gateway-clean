"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {Pool}=require("pg");
const p=name=>fs.readFileSync(path.join(__dirname,"../migrations",name),"utf8");
if(!process.env.ACA_TEST_DATABASE_URL){
 test("repository isolation requires isolated ACA_TEST_DATABASE_URL",{skip:true},()=>{});
}else{
 test("real session identities enforce repository-specific RLS and deny unmapped access",async()=>{
  const pool=new Pool({connectionString:process.env.ACA_TEST_DATABASE_URL,max:1});
  try{
   await pool.query(p("aca_automation_correction_ledger.sql"));
   await pool.query(p("aca_automation_role_policy.sql"));
   await pool.query(p("aca_automation_repository_rls.sql"));
   // Test container superuser provisions disposable login identities only.
   await pool.query(`DO $body$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aca_ci_reader_a') THEN
        CREATE ROLE aca_ci_reader_a LOGIN IN ROLE aca_automation_reader;
      END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aca_ci_reader_b') THEN
        CREATE ROLE aca_ci_reader_b LOGIN IN ROLE aca_automation_reader;
      END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aca_ci_initializer_a') THEN
        CREATE ROLE aca_ci_initializer_a LOGIN IN ROLE aca_automation_initializer;
      END IF;
    END $body$`);
   const repoA=881001,repoB=881002;
   await pool.query("INSERT INTO aca_automation.repository_role_scopes(login_role,repository_id) VALUES('aca_ci_reader_a',$1),('aca_ci_reader_b',$2),('aca_ci_initializer_a',$1) ON CONFLICT DO NOTHING",[repoA,repoB]);
   await pool.query("INSERT INTO aca_automation.correction_ledgers(repository_id,issue_number,pr_number) VALUES($1,20,21),($2,20,21) ON CONFLICT DO NOTHING",[repoA,repoB]);
   async function asLogin(login,fn){
    const c=await pool.connect();
    try{
     await c.query("BEGIN");
     await c.query("SET SESSION AUTHORIZATION "+login);
     const identity=await c.query("SELECT session_user,current_user");
     assert.equal(identity.rows[0].session_user,login);
     assert.equal(identity.rows[0].current_user,login);
     await fn(c);
    }finally{
     await c.query("ROLLBACK");
     c.release();
    }
   }
   for(const [login,expected] of [["aca_ci_reader_a",repoA],["aca_ci_reader_b",repoB]]){
    await asLogin(login,async c=>{
     const visible=await c.query("SELECT repository_id FROM aca_automation.correction_ledgers ORDER BY repository_id");
     assert.deepEqual(visible.rows.map(r=>Number(r.repository_id)),[expected]);
     await assert.rejects(c.query("INSERT INTO aca_automation.correction_ledgers(repository_id,issue_number,pr_number) VALUES($1,99,99)",[expected]),/permission denied/);
    });
   }
   await asLogin("aca_ci_initializer_a",async c=>{
    await assert.rejects(c.query("INSERT INTO aca_automation.correction_ledgers(repository_id,issue_number,pr_number) VALUES($1,25,25)",[repoB]),/row-level security policy/);
   });
   // The RLS scope map is protected from the runtime identities.
   await asLogin("aca_ci_reader_a",async c=>{
     await assert.rejects(c.query("SELECT * FROM aca_automation.repository_role_scopes"),/permission denied/);
   });
  }finally{await pool.end();}
 });
}
