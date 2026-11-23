"use strict";
const {test}=require("node:test");const assert=require("node:assert/strict");const express=require("express");const jwt=require("jsonwebtoken");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const {createRequire}=require("node:module");
const secret="fixture-secret-".repeat(4);
async function fixture(run){
 const calls=[];const filename=path.resolve(__dirname,"../src/routes/tenant.js");const module={exports:{}};
 const real=createRequire(filename);
 const pool={query:async(sql,p)=>{calls.push([sql,p]);return {rows:sql.includes("aca_business_identities")?(p[1]===7?[{tenant_id:7}]:[]):[{id:1,details:{reason:"fixture"}}]}}};
 vm.runInNewContext(fs.readFileSync(filename,"utf8"),{module,exports:module.exports,require:n=>n==="../db/pool"?pool:real(n),process:{env:{JWT_SECRET:secret}},console,Buffer,Map,Date});
 const app=express();app.use(express.json());app.use("/tenant",module.exports);
 const server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));
 try{await run("http://127.0.0.1:"+server.address().port,calls)}finally{await new Promise(r=>server.close(r))}
}
function token(id,purpose="verified_business"){return jwt.sign({tenant_id:id,sub:"owner@example.test",purpose},secret,{issuer:"alphine-ai",audience:"aca-business",algorithm:"HS256",expiresIn:"1h"})}
test("request access ignores caller tenant override and binds verified identity",()=>fixture(async(url,calls)=>{
 const r=await fetch(url+"/tenant/requests?tenant_id=9",{headers:{Authorization:"Bearer "+token(7)}});assert.equal(r.status,200);assert.equal(r.headers.get("cache-control"),"no-store");assert.equal(calls[1][1][0],7);
}));
test("legacy token, inactive identity and missing token cannot read requests",()=>fixture(async(url,calls)=>{
 for(const t of [jwt.sign({tenant_id:7},secret),token(9),null]){const r=await fetch(url+"/tenant/requests",{headers:t?{Authorization:"Bearer "+t}:{}});assert.equal(r.status,401)}
 assert.ok(!calls.some(c=>c[0].includes("aca_customer_requests")));
}));
test("tenant ID login blocked and new login disabled by default",()=>fixture(async(url,calls)=>{
 for(const [route,status] of [["login",403],["login/start",503],["login/redeem",503]]){const r=await fetch(url+"/tenant/"+route,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tenant_id:7})});assert.equal(r.status,status)}
 assert.equal(calls.length,0);
}));
