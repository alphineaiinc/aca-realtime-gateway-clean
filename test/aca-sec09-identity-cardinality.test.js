"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync(require.resolve("../index.js"),"utf8");
test("diagnostic observes distinct identities without exposing addresses and caps storage",()=>{
 const routes=new Map(),logs=[];
 const start=source.indexOf("// Temporary staging-only diagnostic:");
 const end=source.indexOf("// ✅ Story 12.8",start);
 assert.ok(start>=0&&end>start);
 const fakeRequire=()=>({ingressLimit:()=> (_req,_res,next)=>next()});
 vm.runInNewContext(source.slice(start,end),{app:{get:(path,...handlers)=>routes.set(path,handlers)},process:{env:{RENDER_SERVICE_ID:"srv-dc2ffvm8bjmc73fhn8j0"}},require:fakeRequire,console:{log:(event,data)=>logs.push({event,...data})}});
 const probe=routes.get("/__aca_sec09_probe").at(-1);
 const res={status(n){assert.equal(n,204);return this;},end(){}};
 for(let i=0;i<15;i++)probe({ip:"192.0.2."+i,socket:{remoteAddress:"198.51.100."+i},headers:{}},res);
 assert.equal(logs.at(-1).resolvedDistinct,10);
 assert.equal(logs.at(-1).peerDistinct,10);
 assert.ok(!JSON.stringify(logs).includes("198.51.100."));
 assert.ok(!JSON.stringify(logs).includes("192.0.2."));
});
test("aggregate diagnostic budgets are independent of changing proxy identity",()=>{
 const {ingressLimit}=require("../src/security/ingressLimit");
 const a=ingressLimit({max:5,globalBudget:true}),b=ingressLimit({max:5,globalBudget:true});
 function hit(fn,i){let status=204;const res={status(n){status=n;return this;},json(){},set(){}};fn({ip:"192.0.2."+i},res,()=>{});return status;}
 for(let i=0;i<5;i++)assert.equal(hit(a,i),204);
 assert.equal(hit(a,6),429);assert.equal(hit(b,6),204);
});
