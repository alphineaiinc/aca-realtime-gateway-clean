"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {startServer}=require("../src/automation/reviewerStagingServer");

async function withServer(env,run){
 const server=startServer({PORT:"0",ACA_PHASE2A_ENABLED:"true",ACA_PHASE2A_API_TOKEN:"test-only-secret",...env});
 try{
  await new Promise(resolve=>server.listening?resolve():server.once("listening",resolve));
  await run("http://127.0.0.1:"+server.address().port);
 }finally{await new Promise(resolve=>server.close(resolve));}
}

test("database readiness requires bearer authentication",async()=>{
 await withServer({},async base=>{
  const response=await fetch(base+"/phase2a/db-readiness",{method:"POST"});
  assert.equal(response.status,401);
  assert.deepEqual(await response.json(),{error:"unauthorized"});
 });
});

test("database readiness fails closed without configured DB clients",async()=>{
 await withServer({},async base=>{
  const response=await fetch(base+"/phase2a/db-readiness",{
   method:"POST",headers:{Authorization:"Bearer test-only-secret"}});
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{status:"blocked",reason:"database_not_configured"});
 });
});

test("database readiness does not accept GET",async()=>{
 await withServer({},async base=>{
  const response=await fetch(base+"/phase2a/db-readiness");
  assert.equal(response.status,404);
 });
});

test("database readiness remains unauthorized when Phase 2A is disabled",async()=>{
 await withServer({ACA_PHASE2A_ENABLED:"false"},async base=>{
  const response=await fetch(base+"/phase2a/db-readiness",{
   method:"POST",headers:{Authorization:"Bearer test-only-secret"}});
  assert.equal(response.status,401);
 });
});
