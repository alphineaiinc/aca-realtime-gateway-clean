"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),express=require("express");
const {createResourceMetadata}=require("../src/marketplace/resourceMetadata");
test("protected resource metadata is disabled by default and HTTPS-only",async()=>{
 assert.throws(()=>createResourceMetadata({enabled:true,resource:"http://example.invalid/mcp",issuer:"https://issuer.example.invalid"}));
 const app=express();
 app.get("/disabled",createResourceMetadata());
 app.get("/.well-known/oauth-protected-resource/mcp",createResourceMetadata({enabled:true,resource:"https://example.invalid/mcp",issuer:"https://issuer.example.invalid"}));
 const server=app.listen(0,"127.0.0.1");
 try{
 await new Promise(resolve=>server.once("listening",resolve));
 const base="http://127.0.0.1:"+server.address().port;
 assert.equal((await fetch(base+"/disabled")).status,404);
 const response=await fetch(base+"/.well-known/oauth-protected-resource/mcp");
 assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
 assert.deepEqual((await response.json()).authorization_servers,["https://issuer.example.invalid"]);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
