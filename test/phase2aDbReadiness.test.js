"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {startServer}=require("../src/automation/reviewerStagingServer");

async function withServer(env,run,options={}){
 const server=startServer({PORT:"0",ACA_PHASE2A_ENABLED:"true",ACA_PHASE2A_API_TOKEN:"test-only-secret",...env},options);
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

function mockPool({role="aca_phase2a_runtime_reader",broad=false,read=true,write=false,fail=false}={}){
 let released=0;
 const pool={connect:async()=>{
  if(fail)throw Error("simulated_connection_failure");
  return {query:async sql=>sql.includes("pg_has_role")?
   {rows:[{db_role:role,broad_read:broad}]}:
   {rows:[{rl:read,re:read,wl:write,we:write}]},
   release:()=>{released++;}};
 }};
 return {pool,getReleased:()=>released};
}
async function probe(pool,expected=200){
 await withServer({ACA_PHASE2A_LEDGER_ROLE:"aca_phase2a_runtime_reader"},async base=>{
  const response=await fetch(base+"/phase2a/db-readiness",{
   method:"POST",headers:{Authorization:"Bearer test-only-secret"}});
  assert.equal(response.status,expected);
  const body=await response.json();
  if(expected===200)assert.deepEqual(body,{status:"ready",mode:"read_only",databaseRoleVerified:true});
  else assert.equal(body.status,"blocked");
 },{readinessPool:pool});
}
test("readiness succeeds with restricted read-only role and releases connection",async()=>{
 const fixture=mockPool();
 await probe(fixture.pool);
 assert.equal(fixture.getReleased(),1);
});
test("readiness denies broad database read membership",async()=>{
 await probe(mockPool({broad:true}).pool,503);
});
test("readiness denies incorrect role",async()=>{
 await probe(mockPool({role:"aca_staging_owner"}).pool,503);
});
test("readiness denies write privileges",async()=>{
 await probe(mockPool({write:true}).pool,503);
});
test("readiness denies missing SELECT privileges",async()=>{
 await probe(mockPool({read:false}).pool,503);
});
test("readiness fails closed on database connection errors",async()=>{
 await probe(mockPool({fail:true}).pool,503);
});
