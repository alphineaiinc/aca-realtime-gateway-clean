"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {generateKeyPairSync,createHash}=require("node:crypto");
const {readFileSync}=require("node:fs");
const jwt=require("jsonwebtoken");
const {createOAuthAuthorization}=require("../src/marketplace/oauthAuthorization");
const {verifyBusinessToken}=require("../src/marketplace/businessTools");
test("authorization code lifecycle uses actual SQL and verified login identity",async()=>{
 const {PGlite}=await import("@electric-sql/pglite");
 const db=new PGlite();
 try{
 await db.exec("CREATE TABLE public.master_tenants(id INTEGER PRIMARY KEY); INSERT INTO public.master_tenants VALUES(7),(8);");
 for(const file of ["011_verified_business_login.sql","draft_aca_marketplace_oauth_codes.sql"])await db.exec(readFileSync(require("node:path").join(__dirname,"../migrations",file),"utf8"));
 await db.exec("INSERT INTO public.aca_business_identities VALUES ('member@example.test',7,NOW(),true)");
 const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
 const loginSecret="fixture-only-secret-not-for-runtime-12345",issuer="https://issuer.example.test",resource="https://resource.example.test/mcp",clientId="fixture-client",redirectUri="https://client.example.test/callback";
 const oauth=createOAuthAuthorization({pool:db,issuer,resource,clientId,redirectUri,loginSecret,privateKey});
 const login=(tenant=7)=>jwt.sign({sub:"member@example.test",tenant_id:tenant,purpose:"verified_business"},loginSecret,{algorithm:"HS256",issuer:"alphine-ai",audience:"aca-business",expiresIn:60});
 const verifier="a".repeat(43),challenge=createHash("sha256").update(verifier).digest("base64url");
 const request={client_id:clientId,redirect_uri:redirectUri,resource,scope:"aca:profile:read",response_type:"code",code_challenge_method:"S256",code_challenge:challenge,state:"fixture-state"};
 await assert.rejects(oauth.authorize({...request,redirect_uri:redirectUri+"/wrong"},login()));
 await assert.rejects(oauth.authorize({...request,code_challenge_method:"plain"},login()));
 await assert.rejects(oauth.authorize(request,login(8)));
 const grant=await oauth.authorize(request,login());
 assert.equal(grant.state,request.state);
 const exchange={grant_type:"authorization_code",client_id:clientId,redirect_uri:redirectUri,resource,code:grant.code,code_verifier:verifier};
 await assert.rejects(oauth.exchange({...exchange,code_verifier:"b".repeat(43)}));
 const results=await Promise.allSettled([oauth.exchange(exchange),oauth.exchange(exchange)]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 const token=results.find(r=>r.status==="fulfilled").value.access_token;
 assert.equal(verifyBusinessToken({token,publicKey,issuer,audience:resource}).tenantId,7);
 const second=await oauth.authorize(request,login());
 await db.exec("UPDATE public.aca_business_identities SET is_active=false");
 await assert.rejects(oauth.exchange({...exchange,code:second.code}));
 await assert.rejects(oauth.authorize(request,login()));
 }finally{await db.close();}
});
