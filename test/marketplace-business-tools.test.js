"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),jwt=require("jsonwebtoken"),{generateKeyPairSync}=require("node:crypto");
const {verifyBusinessToken,createBusinessTools}=require("../src/marketplace/businessTools");
test("marketplace profile uses only signed tenant claim and rejects cross-scope requests",async()=>{
 const {publicKey,privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
 const issuer="https://issuer.example.invalid",audience="https://resource.example.invalid/mcp";
 let queries=0;
 const profile=createBusinessTools({pool:{query:async(sql,args)=>{
  queries++;assert.match(sql,/FROM public\.master_tenants WHERE id=\$1/);assert.equal(args.length,1);
  return {rows:args[0]===7?[{business_name:"Fixture",preferred_lang:"en",region:"CA",secret:"hidden"}]:[]};
 }}});
 const sign=(claims={})=>jwt.sign({tenant_id:7,scope:"aca:profile:read",...claims},privateKey,{algorithm:"RS256",issuer,audience,subject:"fixture@example.invalid",expiresIn:60});
 const identity=verifyBusinessToken({token:sign(),publicKey,issuer,audience});
 assert.deepEqual(await profile(identity),{business_name:"Fixture",preferred_lang:"en",region:"CA"});
 await assert.rejects(async()=>verifyBusinessToken({token:sign({scope:"other"}),publicKey,issuer,audience}),/UNAUTHORIZED/);
 await assert.rejects(async()=>verifyBusinessToken({token:sign({tenant_id:"7"}),publicKey,issuer,audience}),/UNAUTHORIZED/);
 const multiAudience=jwt.sign({tenant_id:7,scope:"aca:profile:read"},privateKey,{algorithm:"RS256",issuer,audience:[audience,"https://other.example.invalid/mcp"],subject:"fixture@example.invalid",expiresIn:60});
 await assert.throws(()=>verifyBusinessToken({token:multiAudience,publicKey,issuer,audience}),/UNAUTHORIZED/);
 await assert.rejects(async()=>verifyBusinessToken({token:sign(),publicKey,issuer,audience:"https://wrong.example.invalid/mcp"}),/jwt audience invalid/);
 const noRecord=verifyBusinessToken({token:sign({tenant_id:8}),publicKey,issuer,audience});
 await assert.rejects(profile(noRecord),/PROFILE_UNAVAILABLE/);
 assert.equal(queries,2);
});
test("untrusted signing key cannot select a tenant",async()=>{
 const trusted=generateKeyPairSync("rsa",{modulusLength:2048}),untrusted=generateKeyPairSync("rsa",{modulusLength:2048});
 const issuer="https://issuer.example.invalid",audience="https://resource.example.invalid/mcp";
 const token=jwt.sign({tenant_id:8,scope:"aca:profile:read"},untrusted.privateKey,{algorithm:"RS256",issuer,audience,subject:"attacker@example.invalid",expiresIn:60});
 assert.throws(()=>verifyBusinessToken({token,publicKey:trusted.publicKey,issuer,audience}),/invalid signature/);
});
