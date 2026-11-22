"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {GATES,evaluateStagingAcceptance:check}=
 require("../src/automation/phase2StagingAcceptance");
const flags=["agentDispatchAuthorized","dispatched","mergeAuthorized",
 "deployAuthorized","signingAuthorized","productionAuthorization"];
function safe(r){
 for(const k of flags)assert.equal(r[k],false,k);
 assert.equal(r.operationalActivationAuthorized,false);
 assert.equal(r.stagingDeploymentAuthorized,false);
 assert.equal(Object.isFrozen(r),true);
}
test("missing staging evidence is NO-GO and names all blockers",()=>{
 const r=check();safe(r);assert.equal(r.status,"no_go");
 assert.deepEqual(r.missing,GATES);
});
test("offline CI evidence cannot impersonate operational staging verification",()=>{
 const r=check(Object.fromEntries(GATES.map(k=>[k,{
  verified:true,environment:"offline-ci",evidenceUrl:"https://github.com/example/actions/runs/1",
  reviewedByIndependentParty:true
 }])));safe(r);assert.deepEqual(r.missing,GATES);
});
test("even fully attested staging evidence never authorizes actions",()=>{
 const r=check(Object.fromEntries(GATES.map(k=>[k,{
  verified:true,environment:"isolated-staging",
  evidenceUrl:"https://github.com/alphineaiinc/aca-realtime-gateway-clean/actions/runs/123",
  reviewedByIndependentParty:true
 }])));safe(r);assert.equal(r.status,"offline_evidence_complete");
 assert.deepEqual(r.missing,[]);
});
test("missing reviewer, fake URL and injected permission cannot bypass gates",()=>{
 const full=Object.fromEntries(GATES.map(k=>[k,{
  verified:true,environment:"isolated-staging",
  evidenceUrl:"https://github.com/example/evidence/1",reviewedByIndependentParty:true
 }]));
 for(const bad of [
  {reviewedByIndependentParty:false},{verified:"true"},
  {evidenceUrl:"javascript:alert(1)"},{environment:"production"}
 ]){
  const r=check({...full,realMtlsVerified:{...full.realMtlsVerified,...bad},
   dispatched:true,mergeAuthorized:true});
  safe(r);assert.equal(r.status,"no_go");
  assert.deepEqual(r.missing,["realMtlsVerified"]);
 }
 for(const x of [null,[],{},42,"ready"]){
  const r=check(x);safe(r);assert.equal(r.status,"no_go");
 }
});
