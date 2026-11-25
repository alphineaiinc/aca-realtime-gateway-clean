"use strict";
// Runtime catalog checks are necessary, not a substitute for scoped login/RLS acceptance.
const ROLE_BY_OPERATION=Object.freeze({
 read:"aca_automation_reader",
 initialize:"aca_automation_initializer",
 append:"aca_automation_writer"
});
const QUERY=`SELECT current_user AS role_name, session_user AS login_role,
 pg_has_role(session_user, $1, 'USAGE') AS permitted,
 r.rolcanlogin AS can_login,
 NOT EXISTS (SELECT 1 FROM pg_roles g WHERE pg_has_role(r.oid,g.oid,'MEMBER')
 AND (g.rolsuper OR g.rolbypassrls OR g.rolcreaterole OR g.rolcreatedb OR g.rolreplication
 OR g.rolname IN ('pg_read_all_data','pg_write_all_data','pg_execute_server_program','pg_read_server_files','pg_write_server_files','pg_signal_backend'))) AS safe_attributes,
 NOT EXISTS (SELECT 1 FROM pg_roles g WHERE g.rolname=ANY($2::text[]) AND g.rolname<>$1 AND pg_has_role(r.oid,g.oid,'MEMBER')) AS isolated_operation,
 NOT EXISTS (SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND pg_has_role(r.oid,d.datdba,'MEMBER'))
 AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname='aca_automation' AND pg_has_role(r.oid,n.nspowner,'MEMBER'))
 AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='aca_automation' AND pg_has_role(r.oid,c.relowner,'MEMBER')) AS non_owner,
 NOT has_schema_privilege(r.oid,'aca_automation','CREATE') AS no_schema_create,
 NOT EXISTS (
 SELECT 1 FROM (VALUES ('correction_ledgers'),('correction_events')) AS t(name)
 CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) AS p(priv)
 WHERE (has_table_privilege(r.oid,format('aca_automation.%I',t.name),p.priv)
 OR CASE WHEN p.priv IN ('SELECT','INSERT','UPDATE','REFERENCES') THEN has_any_column_privilege(r.oid,format('aca_automation.%I',t.name),p.priv) ELSE false END)
 AND NOT (p.priv='SELECT' AND (t.name='correction_ledgers' OR $1<>'aca_automation_initializer')
 OR p.priv='INSERT' AND ((t.name='correction_ledgers' AND $1='aca_automation_initializer') OR (t.name='correction_events' AND $1='aca_automation_writer'))
 OR p.priv='UPDATE' AND t.name='correction_ledgers' AND $1='aca_automation_writer')
 ) AS no_excess_privileges
 FROM pg_roles r WHERE r.rolname=session_user`;
async function assertAutomationDbRole(client,operation){
 const expected=Object.hasOwn(ROLE_BY_OPERATION,operation)?ROLE_BY_OPERATION[operation]:undefined;
 if(!expected||!client||typeof client.query!=="function")
   throw new Error("invalid_automation_db_role_check");
 const result=await client.query(QUERY,[expected,Object.values(ROLE_BY_OPERATION)]);
 const row=result?.rows?.length===1?result.rows[0]:null;
 if(!row||typeof row.role_name!=="string"||!row.login_role||
   row.role_name!==row.login_role||row.role_name===expected||
   !["permitted","can_login","safe_attributes","isolated_operation","non_owner","no_schema_create","no_excess_privileges"].every(k=>row[k]===true)||
   ["postgres","neondb_owner","aca_staging_owner"].includes(row.login_role))
   throw new Error("unauthorized_automation_db_role");
 return true;
}
module.exports={assertAutomationDbRole,ROLE_BY_OPERATION,QUERY};
