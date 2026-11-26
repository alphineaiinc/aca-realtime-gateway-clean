"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),express=require("express");
const {generateKeyPairSync}=require("node:crypto");
const {mountMarketplace}=require("../src/marketplace/mount");
async function withApp(env,fn,pool={query:async()=>{throw Error("unexpected query");}}){
 const app=express();mountMarketplace(app,{env,pool});
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

test("signed marketplace tokens require exact active verified membership before MCP",async()=>{
 const jwt=require("jsonwebtoken");
 const {publicKey,privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
 const env={ACA_MARKETPLACE_ENABLED:"true",ACA_MARKETPLACE_RESOURCE:"https://example.invalid/mcp",ACA_MARKETPLACE_ISSUER:"https://issuer.example.invalid",ACA_MARKETPLACE_ORIGIN:"https://chatgpt.com",ACA_MARKETPLACE_PUBLIC_KEY:publicKey.export({type:"spki",format:"pem"})};
 let active=true,fail=false,calls=0;
 const pool={query:async(sql,params)=>{
  calls++;
  assert.match(sql,/is_active AND verified_at IS NOT NULL/);
  if(fail)throw Error("unavailable");
  return {rows:active&&params[0]==="member@example.test"&&params[1]===7?[{tenant_id:7}]:[]};
 }};
 const token=(overrides={})=>jwt.sign({sub:"member@example.test",tenant_id:7,scope:"aca:profile:read",...overrides},privateKey,{algorithm:"RS256",issuer:env.ACA_MARKETPLACE_ISSUER,audience:env.ACA_MARKETPLACE_RESOURCE,expiresIn:60});
 await withApp(env,async base=>{
  const send=t=>fetch(base+"/mcp",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json, text/event-stream",Authorization:"Bearer "+t},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"fixture",version:"1"}}})});
  assert.equal((await send(token({scope:"other"}))).status,401);
  assert.equal(calls,0);
  assert.equal((await send(token({tenant_id:8}))).status,403);
  assert.equal((await send(token({sub:"other@example.test"}))).status,403);
  assert.equal((await send(token())).status,200);
  active=false;
  assert.equal((await send(token())).status,403);
  fail=true;
  assert.equal((await send(token())).status,503);
 },pool);
});
