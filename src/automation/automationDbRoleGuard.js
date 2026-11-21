"use strict";
/**
 * Require a real LOGIN session, with inherited membership in exactly the
 * intended NOLOGIN automation role. A privileged SET ROLE session is not
 * accepted as an authenticated service identity.
 * DB ownership, TLS and repository RLS remain independent mandatory controls.
 */
const ROLE_BY_OPERATION=Object.freeze({
 read:"aca_automation_reader",
 initialize:"aca_automation_initializer",
 append:"aca_automation_writer"
});
const QUERY=`SELECT current_user AS role_name, session_user AS login_role,
 pg_has_role(session_user, $1, 'USAGE') AS permitted`;
async function assertAutomationDbRole(client,operation){
 const expected=ROLE_BY_OPERATION[operation];
 if(!expected||!client||typeof client.query!=="function")
   throw new Error("invalid_automation_db_role_check");
 const result=await client.query(QUERY,[expected]);
 const row=result?.rows?.length===1?result.rows[0]:null;
 if(!row||typeof row.role_name!=="string"||!row.login_role||
   row.role_name!==row.login_role||row.role_name===expected||
   row.permitted!==true||
   ["postgres","neondb_owner","aca_staging_owner"].includes(row.login_role))
   throw new Error("unauthorized_automation_db_role");
 return true;
}
module.exports={assertAutomationDbRole,ROLE_BY_OPERATION,QUERY};
