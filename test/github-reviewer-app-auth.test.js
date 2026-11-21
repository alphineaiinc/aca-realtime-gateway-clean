"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync,verify}=require("node:crypto");
const {makeAppJwt,installationReadToken}=require("../src/automation/githubReviewerAppAuth");
const keys=generateKeyPairSync("rsa",{modulusLength:2048});
const privateKey=keys.privateKey.export({format:"pem",type:"pkcs8"});
test("GitHub App JWT uses RS256 with short lifetime and pinned app id",()=>{
 const jwt=makeAppJwt({appId:2345,privateKey,now:1800000000});
 const parts=jwt.split(".");
 assert.equal(parts.length,3);
 const payload=JSON.parse(Buffer.from(parts[1],"base64url"));
 assert.equal(payload.iss,"2345");
 assert.equal(payload.exp-payload.iat,540);
 assert.equal(verify("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),keys.publicKey,
   Buffer.from(parts[2],"base64url")),true);
 assert.throws(()=>makeAppJwt({appId:0,privateKey}),/invalid_github_app_identity/);
});
test("installation token requests exact repository and read-only permissions",async()=>{
 const token=await installationReadToken({appId:2345,installationId:5432,repositoryId:98765,
 privateKey,fetchImpl:async(url,opts)=>{
  assert.equal(url,"https://api.github.com/app/installations/5432/access_tokens");
  assert.equal(opts.method,"POST");
  assert.equal(opts.redirect,"error");
  assert.deepEqual(JSON.parse(opts.body),{repository_ids:[98765],
    permissions:{contents:"read",pull_requests:"read",metadata:"read"}});
  return {status:201,ok:true,json:async()=>({token:"z".repeat(40),
   repositories:[{id:98765}],permissions:{contents:"read",pull_requests:"read",metadata:"read"},
   expires_at:"2026-11-22T00:00:00Z"})};
 }});
 assert.equal(token,"z".repeat(40));
});
test("installation token rejects cross-repository and write-scope responses",async()=>{
 for(const result of [
  {repositories:[{id:999}],permissions:{contents:"read",pull_requests:"read"}},
  {repositories:[{id:98765}],permissions:{contents:"write",pull_requests:"read"}},
  {repositories:[{id:98765},{id:999}],permissions:{contents:"read",pull_requests:"read"}}
 ]){
  await assert.rejects(installationReadToken({appId:2345,installationId:5432,repositoryId:98765,
   privateKey,fetchImpl:async()=>({status:201,ok:true,json:async()=>({...result,
     token:"z".repeat(40),expires_at:"2026-11-22T00:00:00Z"})})}),/invalid_github_app_token_scope/);
 }
});
