"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {assertAutomationDbRole,QUERY}=require("../src/automation/automationDbRoleGuard");
function client(role_name,login_role=role_name,permitted=true,extra={}){
 return {query:async(sql,args)=>{
  assert.equal(sql,QUERY);
  assert.equal(args.length,2);
  assert.deepEqual(args[1],['aca_automation_reader','aca_automation_initializer','aca_automation_writer']);
  return {rows:[{role_name,login_role,permitted,can_login:true,safe_attributes:true,isolated_operation:true,non_owner:true,no_schema_create:true,no_excess_privileges:true,...extra}]};
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

test("every excessive or missing privilege indicator is denied",async()=>{
 for(const flag of ["can_login","safe_attributes","isolated_operation","non_owner","no_schema_create","no_excess_privileges"]){
  for(const value of [false,null,undefined])await assert.rejects(assertAutomationDbRole(client("fixture_reader","fixture_reader",true,{[flag]:value}),"read"),/unauthorized_automation_db_role/);
 }
});
