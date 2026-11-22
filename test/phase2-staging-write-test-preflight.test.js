"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {REQUIRED_ROLES,assessWriteTestPreflight:check}=
 require("../src/automation/phase2StagingWriteTestPreflight");
const good={isolatedBranch:true,nonProductionDatabase:true,
 loginRoles:[...REQUIRED_ROLES],explicitWriteApproval:true,
 rollbackProcedureReviewed:true,disposableFixtures:true,
 independentEvidenceReviewer:true};
function deny(r){assert.equal(r.writesExecuted,false);
 assert.equal(r.writeExecutionAuthorized,false);
 for(const k of ["agentDispatchAuthorized","dispatched","mergeAuthorized",
  "deployAuthorized","signingAuthorized","productionAuthorization"])
  assert.equal(r[k],false,k);}
test("unconfigured write test remains blocked",()=>{
 const r=check();deny(r);assert.equal(r.status,"blocked");
 assert.equal(r.missing.length,7);
});
test("every prerequisite is required independently",()=>{
 for(const key of Object.keys(good)){
  const r=check({...good,[key]:key==="loginRoles"?[]:false});
  deny(r);assert.equal(r.status,"blocked");assert.ok(r.missing.includes(key==="loginRoles"?"dedicatedLogins":key));
 }
});
test("even completed preflight cannot authorize writes",()=>{
 const r=check(good);deny(r);assert.equal(r.status,"preflight_complete_only");
 assert.deepEqual(r.missing,[]);
});
test("invalid and forged flags cannot bypass preflight",()=>{
 for(const input of [null,[],true,"ready",{...good,explicitWriteApproval:"true"},
  {...good,loginRoles:["aca_staging_owner"]}]){
  const r=check(input);deny(r);assert.equal(r.status,"blocked");
 }
});
