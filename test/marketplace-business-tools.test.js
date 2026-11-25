"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),jwt=require("jsonwebtoken"),{generateKeyPairSync}=require("node:crypto");
const {createBusinessTools}=require("../src/marketplace/businessTools");
test("marketplace profile uses verified tenant and rejects cross-scope requests",async()=>{
 const {publicKey,privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
 let active=true,queries=0;
 const profile=createBusinessTools({publicKey,issuer:"https://issuer.example.invalid",audience:"https://resource.example.invalid/mcp",pool:{query:async(sql,args)=>{queries++;assert.deepEqual(args,[7,"fixture@example.invalid"]);return {rows:active?[{business_name:"Fixture",preferred_lang:"en",region:"CA",secret:"hidden"}]:[]}}}});
 const sign=(extra={})=>jwt.sign({sub:"fixture@example.invalid",tenant_id:7,scope:"aca:profile:read",...extra},privateKey,{algorithm:"RS256",issuer:"https://issuer.example.invalid",audience:"https://resource.example.invalid/mcp",expiresIn:60});
 assert.deepEqual(await profile(sign()),{business_name:"Fixture",preferred_lang:"en",region:"CA"});
 await assert.rejects(profile(sign(),{tenant_id:8}));await assert.rejects(profile(sign({scope:"other"})));await assert.rejects(profile("invalid"));assert.equal(queries,1);
 active=false;await assert.rejects(profile(sign()));
});
