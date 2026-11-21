"use strict";
/**
 * Guard against accidentally using owner/admin database sessions for
 * automation operations. This is a secondary check, not authentication:
 * connection establishment, login role grants, TLS, and repository scope
 * must be enforced by the calling service.
 */
const ROLE_BY_OPERATION=Object.freeze({
 read:"aca_automation_reader",
 initialize:"aca_automation_initializer",
 append:"aca_automation_writer"
});
async function assertAutomationDbRole(client,operation){
 const expected=ROLE_BY_OPERATION[operation];
 if(!expected||!client||typeof client.query!=="function")
   throw new Error("invalid_automation_db_role_check");
 const result=await client.query("SELECT current_user AS role_name");
 if(result?.rows?.length!==1||result.rows[0]?.role_name!==expected)
   throw new Error("unauthorized_automation_db_role");
 return true;
}
module.exports={assertAutomationDbRole,ROLE_BY_OPERATION};
