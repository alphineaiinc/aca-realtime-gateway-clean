"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const express=require("express");
const jwt=require("jsonwebtoken");
const {generateKeyPairSync}=require("node:crypto");
const {createMarketplaceRouter}=require("../src/marketplace/mcpRouter");
test("authenticated MCP initialization, discovery and profile invocation",async()=>{
 const {Client}=await import("@modelcontextprotocol/sdk/client/index.js");
 const {StreamableHTTPClientTransport}=await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
 const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
 const resource="https://aca.example.invalid/mcp",issuer="https://auth.example.invalid";
 const token=jwt.sign({tenant_id:7,scope:"aca:profile:read aca:requests:count"},privateKey,{algorithm:"RS256",issuer,audience:resource,subject:"fixture@example.invalid",expiresIn:60});
 const pool={query:async(sql,args)=>{assert.deepEqual(args,[7,"fixture@example.invalid"]);return {rows:[sql.includes("count(*)")?{count:"2"}:{business_name:"Fixture",preferred_lang:"en",region:"CA"}]};}};
 const app=express();app.use(createMarketplaceRouter({enabled:true,resource,issuer,publicKey,pool}));
 const http=app.listen(0,"127.0.0.1");await new Promise(resolve=>http.once("listening",resolve));
 const client=new Client({name:"fixture",version:"1.0.0"});
 try{
 await client.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:"+http.address().port+"/mcp"),{requestInit:{headers:{Authorization:"Bearer "+token}}}));
 const tools=await client.listTools();assert.ok(tools.tools.some(t=>t.name==="aca_get_business_profile"));
 const profile=await client.callTool({name:"aca_get_business_profile",arguments:{}});assert.equal(JSON.parse(profile.content[0].text).business_name,"Fixture");
 const count=await client.callTool({name:"aca_get_request_count",arguments:{}});assert.equal(JSON.parse(count.content[0].text).request_count,"2");
 const restricted=jwt.sign({tenant_id:7,scope:"aca:profile:read"},privateKey,{algorithm:"RS256",issuer,audience:resource,subject:"fixture@example.invalid",expiresIn:60});
 const limited=new Client({name:"limited",version:"1.0.0"});
 try{await limited.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:"+http.address().port+"/mcp"),{requestInit:{headers:{Authorization:"Bearer "+restricted}}}));const denied=await limited.callTool({name:"aca_get_request_count",arguments:{}});assert.equal(denied.isError,true);}finally{await limited.close();}
 }finally{await client.close();http.closeAllConnections();await new Promise(resolve=>http.close(resolve));}
});
