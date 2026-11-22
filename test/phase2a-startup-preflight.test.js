"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {phase2aStartupPreflight}=require("../src/automation/phase2aStartupPreflight");
const args={owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",
 repositoryId:1080201236,workflowId:422174901,runId:44918602966,
 prNumber:27,dbRole:"aca_phase2a_runtime_reader"};
function fixture({repoId=args.repositoryId,dbRole=args.dbRole,canWrite=false,
 failGraphql=false,throwApi=false}={}){
 const requests=[];let released=0;
 const github={rest:{
  repos:{get:async()=>{requests.push("repo");if(throwApi)throw Error("secret");return {data:{id:repoId}};}},
  actions:{getWorkflowRun:async()=>{requests.push("run");return {data:{id:args.runId,
   name:"ACA CI",status:"completed",workflow_id:args.workflowId,
   repository:{id:repoId},head_repository:{id:repoId}}};}},
  pulls:{get:async()=>{requests.push("pr");return {data:{number:27,
   head:{repo:{id:repoId}},base:{repo:{id:repoId}}}};}}
 },graphql:async()=>{requests.push("graphql");if(failGraphql)throw Error("secret");
  return {repository:{pullRequest:{number:27}}};}};
 const pool={connect:async()=>({query:async(sql)=>{
  requests.push("db");
  if(sql.startsWith("SELECT current_user"))return {rows:[{db_role:dbRole,broad_read:false}]};
  return {rows:[{read_ledgers:true,read_events:true,
   write_ledgers:canWrite,write_events:false}]};
 },release:()=>{released++;}})};
 return {github,pool,requests,get released(){return released;}};
}
test("attests GitHub and Neon with read-only queries, no writes",async()=>{
 const x=fixture();const output=await phase2aStartupPreflight({...args,github:x.github,pool:x.pool});
 assert.deepEqual(output,{status:"verified",stage:"github_and_neon_readonly"});
 assert.deepEqual(x.requests,["repo","run","pr","graphql","db","db"]);
 assert.equal(x.released,1);
});
test("fails closed when missing GitHub client or mismatched configuration",async()=>{
 assert.equal((await phase2aStartupPreflight({...args,github:null,pool:{}})).stage,"configuration");
 assert.equal((await phase2aStartupPreflight({...args,runId:0})).stage,"configuration");
 const x=fixture({repoId:123});
 assert.equal((await phase2aStartupPreflight({...args,github:x.github,pool:x.pool})).stage,"github_repository");
 assert.equal(x.requests.includes("db"),false);
});
test("GitHub auth/GraphQL failures block Neon access",async()=>{
 for(const settings of [{throwApi:true},{failGraphql:true}]){
  const x=fixture(settings);
  assert.equal((await phase2aStartupPreflight({...args,github:x.github,pool:x.pool})).status,"blocked");
  assert.equal(x.requests.includes("db"),false);
 }
});
test("rejects incorrect database role and mutation permissions",async()=>{
 for(const settings of [{dbRole:"owner"},{canWrite:true}]){
  const x=fixture(settings);
  const output=await phase2aStartupPreflight({...args,github:x.github,pool:x.pool});
  assert.equal(output.status,"blocked");
  assert.equal(x.released,1);
 }
});
