"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {assertAutomationDbRole,QUERY}=require("../src/automation/automationDbRoleGuard");
function client(role_name,login_role=role_name,permitted=true){
 return {query:async(sql,args)=>{
  assert.equal(sql,QUERY);
  assert.equal(args.length,1);
  return {rows:[{role_name,login_role,permitted}]};
 }};
}
test("accepts authenticated inherited service role per operation",async()=>{
 for(const op of ["read","initialize","append"]){
  assert.equal(await assertAutomationDbRole(client("aca_p2_"+op+"_a"),op),true);
 }
});
test("rejects SET ROLE impersonation, DB owner, missing inherited membership and ambiguous results",async()=>{
 for(const c of [
  client("aca_automation_reader","aca_staging_owner",true),
  client("postgres","postgres",true),
  client("aca_staging_owner","aca_staging_owner",true),
  client("aca_p2_reader_a","aca_p2_reader_a",false),
  client("aca_automation_reader","aca_automation_reader",true),
  {query:async()=>({rows:[]})},
  {query:async()=>({rows:[{},{}]})}
 ]){
  await assert.rejects(assertAutomationDbRole(c,"read"),/unauthorized_automation_db_role/);
 }
 await assert.rejects(assertAutomationDbRole(null,"read"),/invalid_automation_db_role_check/);
 await assert.rejects(assertAutomationDbRole(client("aca_p2_reader_a"),"delete"),/invalid_automation_db_role_check/);
});
