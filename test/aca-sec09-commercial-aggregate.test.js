"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
test("commercial ingress installs independent aggregate ceilings before per-IP guard",()=>{
 const source=fs.readFileSync(require.resolve("../index.js"),"utf8");
 const start=source.indexOf("const ingressClass =");
 const end=source.indexOf("app.use(recognizedRateLimit",start);
 assert.ok(start>=0&&end>start);
 const handlers=[];
 const {ingressLimit}=require("../src/security/ingressLimit");
 vm.runInNewContext(source.slice(start,end),{boundedIngress:ingressLimit,app:{use:fn=>handlers.push(fn)}});
 assert.equal(handlers.length,2);
 function hit(path,ip){let status=204;const req={path,ip},res={status(n){status=n;return this;},json(){},set(){}};handlers[0](req,res,()=>handlers[1](req,res,()=>{}));return status;}
 for(let i=0;i<3000;i++)assert.equal(hit("/twilio/voice","ip-"+i),204);
 assert.equal(hit("/twilio/voice","new-ip"),429);
 assert.equal(hit("/api/stripe/webhook","new-ip"),204);
 for(let i=0;i<300;i++)assert.equal(hit("/health","same-ip"),204);
 assert.equal(hit("/health","same-ip"),429);
});
