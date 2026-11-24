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
   // Actual LOGIN connections, only against the disposable loopback CI database.
   const url=new URL(process.env.ACA_TEST_DATABASE_URL);
   assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
   assert.equal(url.pathname,'/aca_automation_test');
   assert.equal(url.username,'aca_test');
   const {Client}=require('pg');
   const {randomBytes}=require('node:crypto');
   const {assertAutomationDbRole}=require('../src/automation/automationDbRoleGuard');
   const password=randomBytes(24).toString('hex');
   const fixtures=[['aca_ci_guard_reader','aca_automation_reader','read'],['aca_ci_guard_initializer','aca_automation_initializer','initialize'],['aca_ci_guard_writer','aca_automation_writer','append']];
   const created=[];
   try{
    for(const [login,group,operation] of fixtures){
     await pool.query("CREATE ROLE "+login+" LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION PASSWORD '"+password+"'");
     created.push(login);
     await pool.query("GRANT "+group+" TO "+login);
     const target=new URL(url);target.username=login;target.password=password;
     const client=new Client({connectionString:target.toString()});
     await client.connect();
     try{
      assert.equal(await assertAutomationDbRole(client,operation),true);
      for(const other of ['read','initialize','append'].filter(x=>x!==operation))
       await assert.rejects(assertAutomationDbRole(client,other),/unauthorized_automation_db_role/);
      if(operation==='read'){
       for(const [grant,revoke] of [
        ['ALTER ROLE '+login+' BYPASSRLS','ALTER ROLE '+login+' NOBYPASSRLS'],
        ['ALTER ROLE '+login+' SUPERUSER','ALTER ROLE '+login+' NOSUPERUSER'],
        ['GRANT aca_automation_writer TO '+login,'REVOKE aca_automation_writer FROM '+login],
        ['GRANT UPDATE (version) ON aca_automation.correction_ledgers TO '+login,'REVOKE UPDATE (version) ON aca_automation.correction_ledgers FROM '+login],
        ['GRANT CREATE ON SCHEMA aca_automation TO '+login,'REVOKE CREATE ON SCHEMA aca_automation FROM '+login]
       ]){
        await pool.query(grant);
        try{await assert.rejects(assertAutomationDbRole(client,operation),/unauthorized_automation_db_role/);}
        finally{await pool.query(revoke);}
        assert.equal(await assertAutomationDbRole(client,operation),true);
       }
      }
     }finally{await client.end();}
    }
    const owner=await pool.connect();
    try{await assert.rejects(assertAutomationDbRole(owner,'read'),/unauthorized_automation_db_role/);}
    finally{owner.release();}
   }finally{
    for(const login of created.reverse()){
     await pool.query('DROP OWNED BY '+login);
     await pool.query('DROP ROLE '+login);
    }
   }
  }finally{await pool.end();}
 });
}
