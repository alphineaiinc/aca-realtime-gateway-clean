"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createPendingDecision,persistOwnerIntent}=require("../src/automation/phase2aOwnerDecisionStore");
const {createCorrectionHandoff}=require("../src/automation/phase2aCorrectionHandoff");
const R=1080201236,W=422174901,OWNER=230486228,HEAD="a".repeat(40);
const NOW=1700000000000;
function handoff(){
 return createCorrectionHandoff({event:{action:"completed",repository:{id:R},
  workflow_run:{id:777,name:"ACA CI",workflow_id:W,status:"completed",
   conclusion:"failure",head_sha:HEAD,repository:{id:R},head_repository:{id:R}}},
  expectedRepositoryId:R,expectedWorkflowId:W,verifiedIssueLink:true,
  pr:{state:"open",draft:false,number:72,issueNumber:71,headSha:HEAD,
   repositoryId:R,baseRepositoryId:R},
  history:{attempts:0,unchangedFailureCount:0,headSha:HEAD,
   repositoryId:R,prNumber:72,issueNumber:71}});
}
function fake(){
 const rows=new Map(),events=[],queries=[];
 let inTx=false;
 const client={async query(sql,args=[]){
  queries.push(sql);
  if(sql.startsWith("BEGIN")){assert.equal(inTx,false);inTx=true;return {rows:[]};}
  if(sql==="COMMIT"){assert.equal(inTx,true);inTx=false;return {rows:[]};}
  if(sql==="ROLLBACK"){inTx=false;return {rows:[]};}
  if(sql.includes("INSERT INTO aca_automation.owner_decision_requests")){
   if(rows.has(args[0]))return {rows:[]};
   rows.set(args[0],{requestId:args[0],state:"pending",ownerId:args[7]});
   return {rows:[{request_id:args[0]}]};
  }
  if(sql.includes("UPDATE aca_automation.owner_decision_requests")){
   const row=rows.get(args[0]);
   if(!row||row.state!=="pending"||row.ownerId!==args[3])return {rows:[]};
   row.state=args[1];return {rows:[{request_id:args[0]}]};
  }
  if(sql.includes("INSERT INTO aca_automation.owner_decision_events")){
   events.push({id:args[0],type:sql.includes("'created'")?"created":args[1]});
   return {rows:[]};
  }
  throw Error("unexpected_sql");
 }};
 return {client,events,rows,queries};
}
const init=(client,override={})=>createPendingDecision(client,{
 handoff:handoff(),repositoryId:R,ownerId:OWNER,now:NOW,...override});
const decide=(client,packet,override={})=>persistOwnerIntent(client,{
 packet,decision:"approve",actorId:OWNER,currentHandoff:handoff(),
 repositoryId:R,now:NOW+1000,...override});
function safe(r){for(const key of ["agentDispatchAuthorized","dispatched",
 "mergeAuthorized","deployAuthorized","signingAuthorized","productionAuthorization"])
 assert.equal(r[key],false,key);}
test("one pending packet and append-only creation audit",async()=>{
 const f=fake();const a=await init(f.client);assert.equal(a.state,"pending");safe(a);
 assert.equal(f.rows.size,1);assert.deepEqual(f.events.map(e=>e.type),["created"]);
 assert.equal(f.queries.filter(x=>x.startsWith("BEGIN")).length,1);
 assert.equal(f.queries.at(-1),"COMMIT");
 const duplicate=await init(f.client);
 assert.equal(duplicate.state,"blocked");assert.equal(duplicate.reason,"duplicate_request");
 assert.equal(f.events.length,1);safe(duplicate);
});
test("authenticated exact-head approval is atomic, one-time, never dispatches",async()=>{
 const f=fake(),created=await init(f.client);
 const a=await decide(f.client,created.packet);
 assert.equal(a.state,"owner_intent_to_review");safe(a);
 assert.deepEqual(f.events.map(e=>e.type),["created","approved_intent"]);
 const replay=await decide(f.client,created.packet);
 assert.equal(replay.state,"blocked");
 assert.equal(replay.reason,"already_decided_or_expired");
 assert.equal(f.events.length,2);safe(replay);
});
test("rejection persists exactly once and cannot be overwritten",async()=>{
 const f=fake(),created=await init(f.client);
 const rejected=await decide(f.client,created.packet,{decision:"reject"});
 assert.equal(rejected.state,"owner_rejected");safe(rejected);
 const changed=await decide(f.client,created.packet);
 assert.equal(changed.state,"blocked");safe(changed);
 assert.deepEqual(f.events.map(e=>e.type),["created","rejected"]);
});
test("untrusted owner or stale CI head cannot open a transaction",async()=>{
 const f=fake(),created=await init(f.client);
 const baseline=f.queries.length;
 const wrong=await decide(f.client,created.packet,{actorId:OWNER+1});
 assert.equal(wrong.state,"blocked");
 const changed=structuredClone(handoff());changed.request.headSha="b".repeat(40);
 const stale=await decide(f.client,created.packet,{currentHandoff:changed});
 assert.equal(stale.state,"blocked");
 const expired=await decide(f.client,created.packet,{now:NOW+1800000});
 assert.equal(expired.state,"blocked");
 assert.equal(f.queries.length,baseline);
});
test("no request when handoff is unverified; DB problems are fail closed",async()=>{
 const f=fake(),input=structuredClone(handoff());input.state="verification_required";
 assert.equal((await init(f.client,{handoff:input})).state,"blocked");
 const dead={query:async()=>{throw Error("database down / never leak details");}};
 assert.equal((await init(dead)).reason,"trusted_storage_unavailable");
 assert.equal((await decide(null,{})).state,"blocked");
});
