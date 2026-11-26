"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),express=require("express");
const {createMarketplaceRouter}=require("../src/marketplace/mcpRouter");
test("MCP HTTP denies disabled and unauthenticated requests without SDK or DB",async()=>{
 const app=express();app.use("/disabled",createMarketplaceRouter());
 app.use(createMarketplaceRouter({enabled:true,resource:"https://example.invalid/mcp",issuer:"https://issuer.example.invalid",publicKey:"unused",pool:{query(){throw Error("unexpected query")}}}));
 const server=app.listen(0,"127.0.0.1");
 try{await new Promise(resolve=>server.once("listening",resolve));const base="http://127.0.0.1:"+server.address().port;
 assert.equal((await fetch(base+"/disabled/mcp",{method:"POST"})).status,404);
 const response=await fetch(base+"/mcp",{method:"POST"});assert.equal(response.status,401);assert.match(response.headers.get("www-authenticate"),/resource_metadata/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
