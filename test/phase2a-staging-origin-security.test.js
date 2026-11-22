"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {validateStagingOwnerMount}=require("../src/automation/phase2aOwnerMountPreflight");
const host="alphine-aca-phase2a-correction-staging.onrender.com";
const origin="https://"+host;
function config(siteOrigin=origin){
 return {
  enabled:true,isolatedStaging:true,siteOrigin,expectedSiteOrigin:siteOrigin,
  callbackUrl:siteOrigin+"/phase2a/oauth/callback",
  repositoryId:123,ownerId:456,ownerLogin:"test-owner",repository:"test-owner/test-repo",
  clientId:"clientidentifier123",serviceReadToken:"a".repeat(32),
  ownerOAuthClientSecret:"b".repeat(32),reviewerSigningSecret:"c".repeat(32),
  verifyTrustedTransport:()=>true,checkRateLimit:()=>true,
  sessionStore:{putPending(){},consumePending(){},putSession(){},getSession(){},revokeSession(){}},
  decisionClient:{query(){}},loadPendingPacket(){},loadFreshHandoff(){},
  exchangeCode(){},fetchIdentity(){}
 };
}
test("only the exact isolated staging origin passes preflight",()=>{
 const result=validateStagingOwnerMount(config());
 assert.equal(result.ready,true);
 for(const key of ["agentDispatchAuthorized","dispatched","mergeAuthorized","deployAuthorized","signingAuthorized","productionAuthorization"])
  assert.equal(result[key],false);
});
for(const bad of [
 "https://alphineai.com","https://www.alphineai.com",
 "https://alphineai.com.evil.example","https://evil-alphineai.com",
 "https://"+host+".evil.example","https://evil.example/"+host,
 "https://"+host+"@evil.example","https://evil.example@"+host,
 "https://"+host+":444","http://"+host,
 "https://"+host+"/extra","https://"+host+"/?next=evil",
 "https://"+host+"/#fragment","https://"+host+".",
 "https://"+host+"%2eevil.example","https://"+host+"\\@evil.example",
 "not-a-url",""
]){
 test("untrusted origin rejected: "+JSON.stringify(bad),()=>{
  const result=validateStagingOwnerMount(config(bad));
  assert.equal(result.ready,false);
  assert.equal(result.agentDispatchAuthorized,false);
  assert.equal(result.mergeAuthorized,false);
  assert.equal(result.deployAuthorized,false);
  assert.equal(result.signingAuthorized,false);
 });
}
test("disabled and mismatched expected origin fail closed",()=>{
 assert.equal(validateStagingOwnerMount({...config(),enabled:false}).ready,false);
 assert.equal(validateStagingOwnerMount({...config(),expectedSiteOrigin:"https://evil.example"}).ready,false);
});
