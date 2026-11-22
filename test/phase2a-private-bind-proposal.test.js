"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {evaluatePrivateStagingBindProposal:check}=
 require("../src/automation/phase2aPrivateBindProposal");
const base={enabled:true,isolatedStaging:true,renderServiceType:"private_service",
 autoDeploy:false,publicIngressEnabled:false,productionService:false,
 region:"virginia",edgeRegion:"virginia",
 privateDns:"alphine-owner-private.render-internal.com",
 expectedPrivateDns:"alphine-owner-private.render-internal.com",
 port:8443,bindAddress:"10.0.0.8",reviewedCommitSha:"a".repeat(40),
 reviewerSigningEnabled:false,nativeDispatchEnabled:false};
const FLAGS=["agentDispatchAuthorized","dispatched","mergeAuthorized",
 "deployAuthorized","signingAuthorized","productionAuthorization"];
function safe(result){
 for(const flag of FLAGS)assert.equal(result[flag],false,flag);
 assert.equal(result.privateBindAuthorized,false);
 assert.equal(result.networkIsolationVerified,false);
}
test("valid private bind proposal is syntax-only and cannot authorize a listener",()=>{
 const r=check(base);assert.equal(r.ready,true);safe(r);
 assert.equal(Object.isFrozen(r),true);
});
test("private staging proposal fails closed on public ingress, deployment or wrong region",()=>{
 const variants=[
  {enabled:false},{isolatedStaging:false},{renderServiceType:"web_service"},
  {autoDeploy:true},{publicIngressEnabled:true},{productionService:true},
  {region:"ohio"},{edgeRegion:"ohio"},
  {privateDns:"example.com"},{privateDns:"evil.render-internal.com"},
  {port:80},{port:0},{port:65536},{bindAddress:"0.0.0.0"},
  {bindAddress:"::"},{bindAddress:""},{reviewedCommitSha:"unknown"},
  {reviewerSigningEnabled:true},{nativeDispatchEnabled:true}
 ];
 for(const v of variants){
  const r=check({...base,...v});
  assert.equal(r.ready,false,JSON.stringify(v));safe(r);
 }
});
test("untrusted input never throws or starts network activity",()=>{
 for(const v of [null,undefined,{},[],{enabled:true},Object.create(null)]){
  const r=check(v);assert.equal(r.ready,false);safe(r);
 }
});
