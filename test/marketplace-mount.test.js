"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),express=require("express");
const {generateKeyPairSync}=require("node:crypto");
const {mountMarketplace}=require("../src/marketplace/mount");
async function withApp(env,fn){
 const app=express();mountMarketplace(app,{env,pool:{query:async()=>{throw Error("unexpected query");}}});
 const server=app.listen(0,"127.0.0.1");try{await new Promise(r=>server.once("listening",r));await fn("http://127.0.0.1:"+server.address().port);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test("default mount denies MCP and discovery",async()=>withApp({},async base=>{
 for(const path of ["/mcp","/.well-known/oauth-protected-resource/mcp"])assert.equal((await fetch(base+path)).status,404);
}));
test("enabled mount fails closed without configuration",()=>assert.throws(()=>mountMarketplace(express(),{env:{ACA_MARKETPLACE_ENABLED:"true"}})));
test("configured mount advertises exact resource and rejects anonymous calls",async()=>{
 const {publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
 const env={ACA_MARKETPLACE_ENABLED:"true",ACA_MARKETPLACE_RESOURCE:"https://example.invalid/mcp",ACA_MARKETPLACE_ISSUER:"https://issuer.example.invalid",ACA_MARKETPLACE_ORIGIN:"https://chatgpt.com",ACA_MARKETPLACE_PUBLIC_KEY:publicKey.export({type:"spki",format:"pem"})};
 await withApp(env,async base=>{
 const r=await fetch(base+"/.well-known/oauth-protected-resource/mcp");assert.equal(r.status,200);assert.equal((await r.json()).resource,env.ACA_MARKETPLACE_RESOURCE);
 assert.equal((await fetch(base+"/mcp",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).status,401);
 assert.equal((await fetch(base+"/mcp",{method:"POST",headers:{Origin:"https://evil.example.invalid","Content-Type":"application/json"},body:"{}"})).status,403);
 });
});
