"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),express=require("express");
const {generateKeyPairSync}=require("node:crypto");
const {mountMarketplace}=require("../src/marketplace/mount");
const {createOAuthHttp}=require("../src/marketplace/oauthHttp");
test("local issuer is opt-in and rejects mismatched keys",()=>{
 const a=generateKeyPairSync("rsa",{modulusLength:2048}),b=generateKeyPairSync("rsa",{modulusLength:2048});
 const env={ACA_MARKETPLACE_ENABLED:"true",ACA_MARKETPLACE_LOCAL_ISSUER_ENABLED:"true",ACA_MARKETPLACE_RESOURCE:"https://issuer.example.test/mcp",ACA_MARKETPLACE_ISSUER:"https://issuer.example.test",ACA_MARKETPLACE_ORIGIN:"https://chatgpt.com",ACA_MARKETPLACE_PUBLIC_KEY:a.publicKey.export({type:"spki",format:"pem"}),ACA_MARKETPLACE_SIGNING_KEY:b.privateKey.export({type:"pkcs8",format:"pem"}),ACA_MARKETPLACE_CLIENT_ID:"fixture",ACA_MARKETPLACE_REDIRECT_URI:"https://client.example.test/callback",ACA_MARKETPLACE_LOGIN_SECRET:"fixture-secret-not-runtime-123456789"};
 assert.throws(()=>mountMarketplace(express(),{env,pool:{query:async()=>({rows:[]})}}),/MARKETPLACE_SIGNING_KEY_MISMATCH/);
});
test("issuer HTTP rejects cross-origin and missing CSRF before consuming login",async()=>{
 const app=express();let queries=0,exchanges=0;
 const issuer="https://issuer.example.test";
 app.use(createOAuthHttp({issuer,loginSecret:"fixture-secret-not-runtime-123456789",pool:{query:async()=>{queries++;throw Error("unexpected");}},oauth:{validateRequest(){},async exchange(){exchanges++;throw Error("invalid");}}}));
 const server=app.listen(0,"127.0.0.1");
 try{
 await new Promise(r=>server.once("listening",r));
 const base="http://127.0.0.1:"+server.address().port;
 const metadata=await fetch(base+"/.well-known/oauth-authorization-server");
 assert.equal(metadata.status,200);assert.equal((await metadata.json()).issuer,issuer);
 const consent=await fetch(base+"/oauth/authorize?state=%3Cscript%3E");
 assert.equal(consent.status,200);assert.match(consent.headers.get("set-cookie"),/HttpOnly/);assert.match(consent.headers.get("set-cookie"),/Secure/);assert.ok(!(await consent.text()).includes("<script>"));
 for(const origin of ["https://evil.example.test",issuer]){
 const response=await fetch(base+"/oauth/authorize",{method:"POST",headers:{Origin:origin,"Content-Type":"application/x-www-form-urlencoded"},body:"consent=approve"});
 assert.equal(response.status,403);
 }
 assert.equal(queries,0);
 const response=await fetch(base+"/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=authorization_code"});
 assert.equal(response.status,400);assert.equal(exchanges,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
