"use strict";
/**
 * Server-side Phase 2A ledger bridge. Only the separately authenticated
 * reviewer service can supply a pg Pool. GitHub Actions never receives a DB
 * connection string. Enforce role identity before any ledger queries.
 *
 * This module does not create pools, configure secrets, write SQL, or dispatch.
 */
const {observeCorrectionHandoff}=require("../../.github/scripts/phase2a-correction-observer");

function validRole(name) {
 return typeof name==="string" && /^[a-z_][a-z0-9_]{0,62}$/.test(name);
}
async function observeWithTrustedLedger({pool,expectedDbRole,github,owner,repo,event,
 expectedRepositoryId,expectedWorkflowId}={}) {
 if(!pool||typeof pool.connect!=="function"||!validRole(expectedDbRole))
   throw new Error("missing_authenticated_readonly_ledger_configuration");
 const client=await pool.connect();
 try {
  if(!client||typeof client.query!=="function")
   throw new Error("missing_authenticated_ledger_client");
  // PostgreSQL server-attested role identity, not an environment claim.
  const identity=await client.query("SELECT current_user AS db_role, pg_has_role(current_user, 'pg_read_all_data', 'member') AS broad_read");
  if(identity?.rows?.length!==1||
     identity.rows[0].db_role!==expectedDbRole||
     identity.rows[0].broad_read!==false)
    throw new Error("unexpected_ledger_database_role");
  // The expected name alone cannot prove that a role has not been granted
  // mutation privileges. Check both ledger tables explicitly.
  const privileges=await client.query(`SELECT
    has_table_privilege(current_user,'aca_automation.correction_ledgers','SELECT') AS can_read_ledgers,
    has_table_privilege(current_user,'aca_automation.correction_ledgers','INSERT,UPDATE,DELETE') AS can_mutate_ledgers,
    has_table_privilege(current_user,'aca_automation.correction_events','SELECT') AS can_read_events,
    has_table_privilege(current_user,'aca_automation.correction_events','INSERT,UPDATE,DELETE') AS can_mutate_events`);
  const grants=privileges?.rows?.[0];
  if(privileges?.rows?.length!==1||grants.can_read_ledgers!==true||
     grants.can_read_events!==true||grants.can_mutate_ledgers!==false||
     grants.can_mutate_events!==false)
    throw new Error("unsafe_ledger_database_grants");
  const result=await observeCorrectionHandoff({
   github,owner,repo,event,expectedRepositoryId,expectedWorkflowId,
   authenticatedLedgerClient:client
  });
  return Object.freeze({...result,source:"server_attested_readonly_ledger"});
 } finally {
  client.release();
 }
}
module.exports={observeWithTrustedLedger};
