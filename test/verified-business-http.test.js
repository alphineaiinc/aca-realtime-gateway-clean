"use strict";
const {test}=require("node:test");const assert=require("node:assert/strict");const express=require("express");const jwt=require("jsonwebtoken");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const {createRequire}=require("node:module");
const secret="fixture-secret-".repeat(4);
async function fixture(run,env={},overrides={}){
 const calls=[];const filename=path.resolve(__dirname,"../src/routes/tenant.js");const module={exports:{}};
 const real=createRequire(filename);
 const pool={query:async(sql,p)=>{calls.push([sql,p]);return {rows:sql.includes("aca_business_identities")?(p[1]===7?[{tenant_id:7}]:[]):[{id:1,details:{reason:"fixture"}}]}}};
 vm.runInNewContext(fs.readFileSync(filename,"utf8"),{module,exports:module.exports,require:n=>n==="../db/pool"?pool:Object.hasOwn(overrides,n)?overrides[n]:real(n),process:{env:{JWT_SECRET:secret,...env}},console,Buffer,Map,Date});
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

test("profile requires verified identity and scopes lookup to signed tenant",()=>fixture(async(url,calls)=>{
 const good=await fetch(url+"/tenant/profile",{headers:{Authorization:"Bearer "+token(7)}});
 assert.equal(good.status,200);assert.equal(calls[1][1][0],7);
 const legacy=jwt.sign({tenant_id:7},secret);
 const denied=await fetch(url+"/tenant/profile",{headers:{Authorization:"Bearer "+legacy}});
 assert.equal(denied.status,401);
}));
test("profile ingress is rate-limited before database access",()=>fixture(async(url,calls)=>{
 let last;
 for(let i=0;i<31;i++)last=await fetch(url+"/tenant/profile",{headers:{Authorization:"Bearer "+token(7)}});
 assert.equal(last.status,429);
 assert.ok(calls.length<=60); // 30 allowed requests, each performs identity and profile queries
}));

test("controlled notification mode prevents login and onboarding email dispatch over HTTP",async()=>{
 const {createMailSender}=require("../src/voice/requestNotificationWorker");
 let attempts=0;
 const env={ACA_VERIFIED_LOGIN_ENABLED:"true",ACA_ONBOARDING_ENABLED:"true",PROVISION_API_KEY:"fixture-key",ACA_STAGING_EMAIL_ONLY:"true"};
 await fixture(async(url,calls)=>{
  const post=(route,body,headers={})=>fetch(url+"/tenant/"+route,{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
  const login=await post("login/start",{email:"owner@example.test"});
  assert.equal(login.status,202);
  assert.equal(calls.length,0);
  const denied=await post("onboarding/start",{email:"owner@example.test",business_name:"Fixture"});
  assert.equal(denied.status,401);
  assert.equal(calls.length,0);
  const onboarding=await post("onboarding/start",{email:"owner@example.test",business_name:"Fixture"},{"x-api-key":"fixture-key"});
  assert.equal(onboarding.status,400);
  assert.equal(attempts,2);
 },env,{"../voice/requestNotificationWorker":{createMailSender:()=>{attempts++;return createMailSender(env);}}});
});
