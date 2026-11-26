"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),express=require("express");
const {generateKeyPairSync}=require("node:crypto");
const {mountMarketplace}=require("../src/marketplace/mount");
const {createOAuthHttp}=require("../src/marketplace/oauthHttp");
test("local issuer is opt-in and rejects mismatched keys",()=>{
 const a=generateKeyPairSync("rsa",{modulusLength:2048}),b=generateKeyPairSync("rsa",{modulusLength:2048});
 const env={ACA_MARKETPLACE_ENABLED:"true",ACA_MARKETPLACE_LOCAL_ISSUER_ENABLED:"true",ACA_MARKETPLACE_RESOURCE:"https://issuer.example.test/mcp",ACA_MARKETPLACE_ISSUER:"https://issuer.example.test",ACA_MARKETPLACE_ORIGIN:"https://chatgpt.com",ACA_MARKETPLACE_PUBLIC_KEY:a.publicKey.export({type:"spki",format:"pem"}),ACA_MARKETPLACE_SIGNING_KEY:b.privateKey.export({type:"pkcs8",format:"pem"}),ACA_MARKETPLACE_CLIENT_ID:"fixture",ACA_MARKETPLACE_REDIRECT_URI:"https://client.example.test/callback",ACA_MARKETPLACE_LOGIN_SECRET:"fixture-secret-not-runtime-123456789"};
 assert.throws(()=>mountMarketplace(express(),{env,resourcePool:{query:async()=>({rows:[]})},issuerPool:{query:async()=>({rows:[]})}}),/MARKETPLACE_SIGNING_KEY_MISMATCH/);
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

test("verified consent through HTTP issues a single-use PKCE token",async()=>{
 const {PGlite}=await import("@electric-sql/pglite");
 const {createHash}=require("node:crypto");
 const {readFileSync}=require("node:fs");
 const db=new PGlite();let server;
 try{
 await db.exec("CREATE TABLE public.master_tenants(id INTEGER PRIMARY KEY); INSERT INTO public.master_tenants VALUES(7);");
 for(const file of ["011_verified_business_login.sql","draft_aca_marketplace_oauth_codes.sql"])await db.exec(readFileSync(require("node:path").join(__dirname,"../migrations",file),"utf8"));
 await db.exec("INSERT INTO public.aca_business_identities VALUES ('member@example.test',7,NOW(),true)");
 const loginCode="a".repeat(64),hash=createHash("sha256").update(loginCode).digest("hex");
 await db.query("INSERT INTO public.aca_login_challenges(token_hash,email,expires_at) VALUES($1,$2,NOW()+INTERVAL '5 minutes')",[hash,"member@example.test"]);
 const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
 const issuer="https://issuer.example.test",resource=issuer+"/mcp",redirect="https://client.example.test/callback";
 const env={ACA_MARKETPLACE_ENABLED:"true",ACA_MARKETPLACE_LOCAL_ISSUER_ENABLED:"true",ACA_MARKETPLACE_RESOURCE:resource,ACA_MARKETPLACE_ISSUER:issuer,ACA_MARKETPLACE_ORIGIN:"https://chatgpt.com",ACA_MARKETPLACE_PUBLIC_KEY:publicKey.export({type:"spki",format:"pem"}),ACA_MARKETPLACE_SIGNING_KEY:privateKey.export({type:"pkcs8",format:"pem"}),ACA_MARKETPLACE_CLIENT_ID:"fixture",ACA_MARKETPLACE_REDIRECT_URI:redirect,ACA_MARKETPLACE_LOGIN_SECRET:"fixture-secret-not-runtime-123456789"};
 const app=express();mountMarketplace(app,{env,resourcePool:{query:async()=>{throw Error("unexpected resource query");}},issuerPool:db});
 server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));
 const base="http://127.0.0.1:"+server.address().port,verifier="b".repeat(43);
 const params=new URLSearchParams({client_id:"fixture",redirect_uri:redirect,resource,scope:"aca:profile:read",response_type:"code",code_challenge_method:"S256",code_challenge:createHash("sha256").update(verifier).digest("base64url"),state:"fixture-state"});
 const consent=await fetch(base+"/oauth/authorize?"+params);
 assert.equal(consent.status,200);
 const cookie=consent.headers.get("set-cookie").split(";")[0],html=await consent.text();
 for(const name of ["expires","csrf"])params.set(name,html.match(new RegExp('name="'+name+'" value="([^"]+)"'))[1]);
 params.set("login_code",loginCode);params.set("consent","approve");
 const approval=await fetch(base+"/oauth/authorize",{method:"POST",redirect:"manual",headers:{Origin:issuer,Cookie:cookie},body:params});
 assert.equal(approval.status,303);
 const callback=new URL(approval.headers.get("location"));assert.equal(callback.origin,new URL(redirect).origin);assert.equal(callback.searchParams.get("state"),"fixture-state");
 const grant=new URLSearchParams({grant_type:"authorization_code",client_id:"fixture",redirect_uri:redirect,resource,code:callback.searchParams.get("code"),code_verifier:verifier});
 const exchange=()=>fetch(base+"/oauth/token",{method:"POST",body:grant});
 const response=await exchange();assert.equal(response.status,200);const token=await response.json();
 assert.equal(require("../src/marketplace/businessTools").verifyBusinessToken({token:token.access_token,publicKey,issuer,audience:resource}).tenantId,7);
 assert.equal((await exchange()).status,400);
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await db.close();}
});

test("marketplace rejects shared or absent issuer pools before mounting",()=>{
 const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
 const env={ACA_MARKETPLACE_ENABLED:"true",ACA_MARKETPLACE_LOCAL_ISSUER_ENABLED:"true",ACA_MARKETPLACE_RESOURCE:"https://issuer.example.test/mcp",ACA_MARKETPLACE_ISSUER:"https://issuer.example.test",ACA_MARKETPLACE_ORIGIN:"https://chatgpt.com",ACA_MARKETPLACE_PUBLIC_KEY:publicKey.export({type:"spki",format:"pem"}),ACA_MARKETPLACE_SIGNING_KEY:privateKey.export({type:"pkcs8",format:"pem"})};
 const pool={query:async()=>{throw Error("unexpected query");}};
 assert.throws(()=>mountMarketplace(express(),{env,resourcePool:pool,issuerPool:pool}),/MARKETPLACE_DISTINCT_ISSUER_POOL_REQUIRED/);
 assert.throws(()=>mountMarketplace(express(),{env,resourcePool:pool}),/MARKETPLACE_DISTINCT_ISSUER_POOL_REQUIRED/);
 assert.throws(()=>mountMarketplace(express(),{env}),/MARKETPLACE_RESOURCE_POOL_REQUIRED/);
 const {mountRuntimeMarketplace}=require("../src/marketplace/runtimePools");
 assert.throws(()=>mountRuntimeMarketplace(express(),{...env,DATABASE_URL:"postgres://same:fixture@localhost/main",ACA_MARKETPLACE_RESOURCE_DATABASE_URL:"postgres://same:other@localhost/main",ACA_MARKETPLACE_ISSUER_DATABASE_URL:"postgres://issuer:fixture@localhost/main"}),/MARKETPLACE_DISTINCT_DATABASE_IDENTITIES_REQUIRED/);
});
