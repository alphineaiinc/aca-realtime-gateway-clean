"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {Pool}=require("pg");
if(!process.env.ACA_TEST_DATABASE_URL){
 test("role isolation requires isolated ACA_TEST_DATABASE_URL",{skip:true},()=>{});
}else{
 test("PostgreSQL service roles deny cross-function writes and event mutation",async()=>{
  const pool=new Pool({connectionString:process.env.ACA_TEST_DATABASE_URL,max:2});
  try{
   const schema=fs.readFileSync(path.join(__dirname,"../migrations/aca_automation_correction_ledger.sql"),"utf8");
   const roles=fs.readFileSync(path.join(__dirname,"../migrations/aca_automation_role_policy.sql"),"utf8");
   await pool.query(schema);
   await pool.query(roles);
   async function asRole(role,sql,params=[],allowed=true){
    const c=await pool.connect();
    try{
     await c.query("BEGIN");
     await c.query("SET LOCAL ROLE "+role);
     assert.equal((await c.query("SELECT current_user AS role_name")).rows[0].role_name,role);
     if(allowed) await c.query(sql,params);
     else await assert.rejects(c.query(sql,params),/permission denied/);
    }finally{await c.query("ROLLBACK");c.release();}
   }
   const scope=[987654321,20,21];
   const insertLedger="INSERT INTO aca_automation.correction_ledgers(repository_id,issue_number,pr_number) VALUES($1,$2,$3)";
   await asRole("aca_automation_reader","SELECT version FROM aca_automation.correction_ledgers");
   await asRole("aca_automation_reader",insertLedger,scope,false);
   await asRole("aca_automation_initializer",insertLedger,scope);
   await asRole("aca_automation_initializer","UPDATE aca_automation.correction_ledgers SET version=1",[],false);
   await asRole("aca_automation_initializer","INSERT INTO aca_automation.correction_events DEFAULT VALUES",[],false);
   await asRole("aca_automation_writer","SELECT version FROM aca_automation.correction_ledgers");
   await asRole("aca_automation_writer",insertLedger,scope,false);
   await asRole("aca_automation_writer","UPDATE aca_automation.correction_events SET failure_fingerprint='tampered'",[],false);
   await asRole("aca_automation_writer","DELETE FROM aca_automation.correction_events",[],false);
  }finally{await pool.end();}
 });
}
