"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {assertAutomationDbRole}=require("../src/automation/automationDbRoleGuard");
test("requires exact dedicated role per operation",async()=>{
 for(const [op,role] of [["read","aca_automation_reader"],["initialize","aca_automation_initializer"],["append","aca_automation_writer"]]){
  assert.equal(await assertAutomationDbRole({query:async sql=>{
   assert.equal(sql,"SELECT current_user AS role_name");
   return {rows:[{role_name:role}]};
  }},op),true);
  await assert.rejects(assertAutomationDbRole({query:async()=>({rows:[{role_name:"postgres"}]})},op),/unauthorized_automation_db_role/);
 }
});
test("rejects unknown operation, missing role, ambiguous result and absent client",async()=>{
 await assert.rejects(assertAutomationDbRole(null,"read"),/invalid_automation_db_role_check/);
 await assert.rejects(assertAutomationDbRole({query:async()=>({rows:[]})},"read"),/unauthorized_automation_db_role/);
 await assert.rejects(assertAutomationDbRole({query:async()=>({rows:[{role_name:"aca_automation_reader"},{role_name:"aca_automation_reader"}]})},"read"),/unauthorized_automation_db_role/);
 await assert.rejects(assertAutomationDbRole({query:async()=>({rows:[{role_name:"aca_automation_reader"}]})},"delete"),/invalid_automation_db_role_check/);
});
