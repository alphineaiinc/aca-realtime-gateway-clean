"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const express=require("express");
const source=fs.readFileSync(require("node:path").join(__dirname,"../index.js"),"utf8");
test("global ingress is installed before parsers and routes",()=>{
 const pos=source.indexOf("app.use(recognizedRateLimit(");
 assert.ok(pos>0);
 assert.ok(pos<source.indexOf("app.use(express.json("));
 assert.ok(pos<source.indexOf('app.use("/api/stripe"'));
 assert.ok(pos<source.indexOf('app.use("/twilio"'));
});
test("actual ingress rejects exhaustion before authentication or callback parsing",async t=>{
 const app=express();
 app.set("trust proxy",1);
 const start=source.indexOf('const { rateLimit: recognizedRateLimit }');
 const end=source.indexOf(";",source.indexOf("app.use(recognizedRateLimit("))+1;
 assert.ok(start>=0&&end>start);
 vm.runInNewContext(source.slice(start,end),{app,require:p=>p==="./src/security/ingressLimit"?require("../src/security/ingressLimit"):require(p)});
 let reads=0;
 app.post("/callback",express.raw({type:"application/json"}),(req,res)=>{reads++;assert.deepEqual(req.body,Buffer.from('{"test":true}'));res.status(200).type('text/plain').send('{"test":true}');});
 const server=app.listen(0,"127.0.0.1");
 await new Promise((resolve,reject)=>{server.once("listening",resolve);server.once("error",reject);});
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const url="http://127.0.0.1:"+server.address().port+"/callback";
 const send=(left,right)=>fetch(url,{method:"POST",headers:{"content-type":"application/json","x-forwarded-for":left+", "+right},body:'{"test":true}'});
 for(let i=0;i<300;i++){const r=await send("192.0.2."+(i%250+1),"198.51.100.1");assert.equal(r.status,200);assert.equal(await r.text(),'{"test":true}');}
 const denied=await send("203.0.113.1","198.51.100.1");assert.equal(denied.status,429);await denied.text();assert.equal(reads,300);
 const other=await send("192.0.2.1","2001:db8:abcd:1234::1");assert.equal(other.status,200);await other.text();
});
test("recognized library groups IPv6 addresses within its default subnet",()=>{
 const {ipKeyGenerator}=require("express-rate-limit");
 assert.equal(ipKeyGenerator("2001:db8:abcd:1200::1"),ipKeyGenerator("2001:db8:abcd:1200::2"));
 assert.notEqual(ipKeyGenerator("2001:db8:abcd:1200::1"),ipKeyGenerator("2001:db8:abcd:3400::1"));
});
