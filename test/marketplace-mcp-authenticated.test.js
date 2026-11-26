"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const express=require("express");
const jwt=require("jsonwebtoken");
const {generateKeyPairSync}=require("node:crypto");
const {createMarketplaceRouter}=require("../src/marketplace/mcpRouter");
const {rateLimitIP}=require("../src/brain/utils/rateLimiters");
const fs=require("node:fs");

test("authenticated MCP exposes only schema-backed profile reads and isolates tenants",async()=>{
 const {Client}=await import("@modelcontextprotocol/sdk/client/index.js");
 const {StreamableHTTPClientTransport}=await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
 const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
 const resource="https://aca.example.invalid/mcp",issuer="https://auth.example.invalid";
 const pool={query:async(sql,args)=>{
  assert.match(sql,/FROM public\.master_tenants WHERE id=\$1/);
  assert.equal(args.length,1);
  const records={7:{business_name:"Tenant Seven",preferred_lang:"en",region:"CA"},8:{business_name:"Tenant Eight",preferred_lang:"fr",region:"NG"}};
  return {rows:records[args[0]]?[records[args[0]]]:[]};
 }};
 const app=express();app.use(createMarketplaceRouter({enabled:true,resource,issuer,publicKey,pool}));
 const http=app.listen(0,"127.0.0.1");await new Promise(resolve=>http.once("listening",resolve));
 const endpoint="http://127.0.0.1:"+http.address().port+"/mcp";
 async function connect(tenantId,subject="fixture@example.invalid",signingKey=privateKey,scope="aca:profile:read"){
  const token=jwt.sign({tenant_id:tenantId,scope},signingKey,{algorithm:"RS256",issuer,audience:resource,subject,expiresIn:60});
  const client=new Client({name:"fixture-"+tenantId,version:"1.0.0"});
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint),{requestInit:{headers:{Authorization:"Bearer "+token}}}));
  return client;
 }
 try{
  const seven=await connect(7),eight=await connect(8);
  try{
   const sevenTools=await seven.listTools(),eightTools=await eight.listTools();
   assert.deepEqual(sevenTools.tools.map(t=>t.name),["aca_get_business_profile"]);
   assert.deepEqual(eightTools.tools.map(t=>t.name),["aca_get_business_profile"]);
   const sevenProfile=JSON.parse((await seven.callTool({name:"aca_get_business_profile",arguments:{}})).content[0].text);
   const eightProfile=JSON.parse((await eight.callTool({name:"aca_get_business_profile",arguments:{}})).content[0].text);
   assert.equal(sevenProfile.business_name,"Tenant Seven");
   assert.equal(eightProfile.business_name,"Tenant Eight");
   assert.notEqual(sevenProfile.business_name,eightProfile.business_name);
  }finally{await seven.close();await eight.close();}
  const wrongAudience=jwt.sign({tenant_id:7,scope:"aca:profile:read"},privateKey,{algorithm:"RS256",issuer,audience:"https://other.example.invalid/mcp",subject:"fixture@example.invalid",expiresIn:60});
  const denied=await fetch(endpoint,{method:"POST",headers:{Authorization:"Bearer "+wrongAudience,"Content-Type":"application/json"},body:"{}"});
  assert.equal(denied.status,401);
  const noScope=jwt.sign({tenant_id:7,scope:"aca:requests:count"},privateKey,{algorithm:"RS256",issuer,audience:resource,subject:"fixture@example.invalid",expiresIn:60});
  const noScopeResponse=await fetch(endpoint,{method:"POST",headers:{Authorization:"Bearer "+noScope,"Content-Type":"application/json"},body:"{}"});
  assert.equal(noScopeResponse.status,401);
 }finally{http.closeAllConnections();await new Promise(resolve=>http.close(resolve));}
});

test("profile lookup fails closed when a tenant has no matching master record",async()=>{
 const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
 const {verifyBusinessToken,createBusinessTools}=require("../src/marketplace/businessTools");
 const resource="https://aca.example.invalid/mcp",issuer="https://auth.example.invalid";
 const token=jwt.sign({tenant_id:999,scope:"aca:profile:read"},privateKey,{algorithm:"RS256",issuer,audience:resource,subject:"missing@example.invalid",expiresIn:60});
 const identity=verifyBusinessToken({token,publicKey,issuer,audience:resource});
 const read=createBusinessTools({pool:{query:async()=>({rows:[]})}});
 await assert.rejects(read(identity),/PROFILE_UNAVAILABLE/);
});

test("marketplace MCP ingress is rate-limited and rejects excess requests",()=>{
 const source=fs.readFileSync(require.resolve("../src/marketplace/mcpRouter"),"utf8");
 assert.match(source,/router\.post\(["']\/mcp["'],rateLimitIP\(/);
 const limit=rateLimitIP({windowMs:60_000,max:1,keyPrefix:"marketplace_mcp_regression"});
 const req={ip:"198.51.100.77"};
 let status=200,body=null,continued=0;
 const res={setHeader(){},status(code){status=code;return this;},json(value){body=value;return this;}};
 limit(req,res,()=>{continued++;});
 assert.equal(continued,1);
 limit(req,res,()=>{continued++;});
 assert.equal(status,429);
 assert.deepEqual(body,{ok:false,error:"rate_limited"});
 assert.equal(continued,1);
});
