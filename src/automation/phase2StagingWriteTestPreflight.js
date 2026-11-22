"use strict";
/** Read-only assessment of SQL privilege/RLS test prerequisites.
 * This module never connects to a database or performs mutations.
 */
const REQUIRED_ROLES=Object.freeze(["aca_p2_reader_a","aca_p2_reader_b",
 "aca_p2_writer_a","aca_p2_initializer_a","aca_phase2a_runtime_reader"]);
const DENIED=Object.freeze({agentDispatchAuthorized:false,dispatched:false,
 mergeAuthorized:false,deployAuthorized:false,signingAuthorized:false,
 productionAuthorization:false});
function assessWriteTestPreflight(input){
 const o=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
 const checks={
  isolatedBranch:o.isolatedBranch===true,
  nonProductionDatabase:o.nonProductionDatabase===true,
  dedicatedLogins:Array.isArray(o.loginRoles)&&REQUIRED_ROLES.every(x=>o.loginRoles.includes(x)),
  explicitWriteApproval:o.explicitWriteApproval===true,
  rollbackProcedureReviewed:o.rollbackProcedureReviewed===true,
  disposableFixtures:o.disposableFixtures===true,
  independentEvidenceReviewer:o.independentEvidenceReviewer===true
 };
 const missing=Object.keys(checks).filter(x=>!checks[x]);
 return Object.freeze({status:missing.length?"blocked":"preflight_complete_only",
  writesExecuted:false,writeExecutionAuthorized:false,
  missing:Object.freeze(missing),...DENIED});
}
module.exports={REQUIRED_ROLES,assessWriteTestPreflight};
