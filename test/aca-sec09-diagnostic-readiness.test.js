"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const express=require("express");
const source=fs.readFileSync(require.resolve("../index.js"),"utf8");
const start=source.indexOf("// Temporary staging-only diagnostic:");
const end=source.indexOf("// ✅ Story 12.8",start);
assert.ok(start>=0 && end>start);
const code=source.slice(start,end);
for(const serviceId of ["srv-dc2ffvm8bjmc73fhn8j0","wrong-service",""]){
 test("diagnostic identity "+(serviceId||"absent"),async()=>{
  const app=express(), records=[];
  vm.runInNewContext(code,{app,process:{env:{RENDER_SERVICE_ID:serviceId}},console:{log:(...args)=>records.push(args)},require:p=>{assert.equal(p,"./src/security/ingressLimit");return require("../src/security/ingressLimit");}});
  const matches=serviceId==="srv-dc2ffvm8bjmc73fhn8j0";
  assert.equal(records[0][0],"ACA_SEC09_START");
  assert.equal(records[0][1].serviceMatches,matches);
  const server=app.listen(0,"127.0.0.1");
  try {
   await new Promise(resolve=>server.once("listening",resolve));
   const base="http://127.0.0.1:"+server.address().port;
   const ready=await fetch(base+"/__aca_sec09_ready");
   assert.equal(ready.status,matches?200:404);
   if(!matches){assert.equal((await fetch(base+"/__aca_sec09_probe")).status,404);return;}
   assert.equal(await ready.text(),"aca-sec09-probe-v3");
   assert.equal((await fetch(base+"/__aca_sec09_probe",{headers:{"X-Forwarded-For":"192.0.2.123"}})).status,204);
   assert.equal(records[1][1].markerPresent,true);
   assert.equal(records[1][1].resolvedIsMarker,false);
   for(let i=0;i<5;i++)assert.equal((await fetch(base+"/__aca_sec09_capacity/twilio")).status,204);
   assert.equal((await fetch(base+"/__aca_sec09_capacity/twilio")).status,429);
   for(const kind of ["stripe","ordinary"])assert.equal((await fetch(base+"/__aca_sec09_capacity/"+kind)).status,204);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 });
}
