"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {verifyGitHubOwner}=require("../src/automation/phase2aOwnerIdentity");
const o=230486228,token="owner-oauth-local-fixture-012345678901",
 serviceReadToken="read-only-service-local-fixture-012345678901";
const base={userOAuthToken:token,serviceReadToken,
 expectedOwnerId:o,expectedOwnerLogin:"alphineaiinc"};
function safe(x){for(const field of ["agentDispatchAuthorized","mergeAuthorized",
 "deployAuthorized"])assert.equal(x[field],false);}
test("GitHub authenticated user ID and login validate owner but never authorize actions",async()=>{
 const requests=[];
 const r=await verifyGitHubOwner({...base,fetchImpl:async(url,options)=>{
  requests.push({url,options});
  return {ok:true,json:async()=>({id:o,login:"AlphineAIInc"})};
 }});
 assert.equal(r.verified,true);assert.equal(r.ownerId,o);safe(r);
 assert.deepEqual(requests.map(x=>x.url),["https://api.github.com/user"]);
 assert.match(requests[0].options.headers.Authorization,/^Bearer owner-oauth/);
 assert.equal(requests[0].options.method,"GET");
});
test("incorrect GitHub owner ID or login is blocked, no request data returned",async()=>{
 for(const json of [{id:o+1,login:"alphineaiinc"},
  {id:o,login:"attacker"},{login:"alphineaiinc"},null]){
  const r=await verifyGitHubOwner({...base,fetchImpl:async()=>({
   ok:true,json:async()=>json
  })});
  assert.equal(r.verified,false);safe(r);
  assert.equal(JSON.stringify(r).includes(token),false);
 }
});
test("refuse shared service PAT, invalid tokens and unconfigured owner before fetching",async()=>{
 for(const changes of [{userOAuthToken:serviceReadToken},
  {userOAuthToken:"fake"},{serviceReadToken:""},
  {expectedOwnerId:0},{expectedOwnerLogin:"invalid login"}]){
  let n=0;const r=await verifyGitHubOwner({...base,...changes,
   fetchImpl:async()=>{n++;throw Error("should not happen");}});
  assert.equal(n,0);assert.equal(r.verified,false);safe(r);
 }
});
test("GitHub 401/403, network errors and bad JSON fail closed without credentials",async()=>{
 for(const fetchImpl of [
  async()=>({ok:false,status:401}),
  async()=>({ok:false,status:403}),
  async()=>{throw new Error("token in error");},
  async()=>({ok:true,json:async()=>{throw Error("bad json");}})
 ]){
  const r=await verifyGitHubOwner({...base,fetchImpl});
  assert.equal(r.verified,false);safe(r);
  assert.equal(JSON.stringify(r).includes(token),false);
 }
});
