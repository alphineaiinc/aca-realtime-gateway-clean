"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {serviceReadHistory,serviceInitializeLedger,serviceAppendCorrection}=require("../src/automation/automationLedgerService");
const scope={repositoryId:111,issueNumber:20,prNumber:21};
const head="b".repeat(40),context={...scope,headSha:head,authenticated:true,actorId:123};
function client(role){
 const calls=[];
 return {calls,release(){},async query(sql){
   calls.push(sql);
   if(sql.startsWith("SELECT current_user AS role_name, session_user AS login_role"))return {rows:[{role_name:role==="postgres"?"postgres":"aca_p2_"+role.split("_").at(-1)+"_a",login_role:role==="postgres"?"postgres":"aca_p2_"+role.split("_").at(-1)+"_a",permitted:role!=="postgres",can_login:true,safe_attributes:true,isolated_operation:true,non_owner:true,no_schema_create:true,no_excess_privileges:true}]};
   if(sql.startsWith("SELECT version"))return {rows:[{version:0}]};
   if(sql.includes("FROM aca_automation.correction_events"))return {rows:[]};
   if(sql.includes("ON CONFLICT DO NOTHING RETURNING version"))return {rows:[{version:0}]};
   return {rows:[]};
 }};
}
test("service read and initialize accept exact scoped role",async()=>{
 assert.equal((await serviceReadHistory(client("aca_automation_reader"),scope,context)).attempts,0);
 assert.equal((await serviceInitializeLedger(client("aca_automation_initializer"),scope,context)).initialized,true);
});
test("service denies admin role and mismatched repository, issue, PR or head",async()=>{
 for(const changed of [{repositoryId:222},{issueNumber:22},{prNumber:22},{headSha:"INVALID"},{authenticated:false}]){
  const c=client("aca_automation_reader");
  await assert.rejects(serviceReadHistory(c,scope,{...context,...changed}),/unverified_automation_service_scope/);
  assert.equal(c.calls.length,0);
 }
 await assert.rejects(serviceReadHistory(client("postgres"),scope,context),/unauthorized_automation_db_role/);
 await assert.rejects(serviceReadHistory({query:async()=>({rows:[]})},scope,context),/missing_pinned_automation_db_session/);
});
test("service append rejects stale head, actor mismatch and unauthorized role",async()=>{
 const claim={...scope,actorId:123,priorHeadSha:"a".repeat(40),
 resultingHeadSha:head,eventId:"00000000-0000-4000-8000-000000000001",
 failureFingerprint:"ci:failure"};
 await assert.rejects(serviceAppendCorrection(client("aca_automation_writer"),
  {...claim,resultingHeadSha:"c".repeat(40)},context),/stale_correction_service_head/);
 await assert.rejects(serviceAppendCorrection(client("aca_automation_writer"),
  {...claim,actorId:999},context),/unverified_correction_service_actor/);
 await assert.rejects(serviceAppendCorrection(client("postgres"),claim,context),/unauthorized_automation_db_role/);
});

test("all ledger operations retain authorized input snapshots during asynchronous role check",async()=>{
 for(const operation of ["read","initialize","append"]){
  const input={...scope,actorId:123,priorHeadSha:"a".repeat(40),resultingHeadSha:head,eventId:"00000000-0000-4000-8000-000000000001",failureFingerprint:"ci:failure"};
  const ctx={...context};const params=[];
  const c=client("aca_automation_"+({read:"reader",initialize:"initializer",append:"writer"}[operation]));
  const original=c.query.bind(c);
  c.query=async(sql,args)=>{
   if(sql.startsWith("SELECT current_user AS role_name")){
    await Promise.resolve();
    Object.assign(input,{repositoryId:999,issueNumber:999,prNumber:999,actorId:999,resultingHeadSha:"c".repeat(40),failureFingerprint:"changed:failure"});
    Object.assign(ctx,{repositoryId:999,actorId:999,headSha:"c".repeat(40)});
   }else if(args){params.push([...args]);}
   return original(sql,args);
  };
  if(operation==="read")await serviceReadHistory(c,input,ctx);
  if(operation==="initialize")assert.equal((await serviceInitializeLedger(c,input,ctx)).verifiedHeadSha,head);
  if(operation==="append")assert.equal((await serviceAppendCorrection(c,input,ctx)).attempts,1);
  assert.ok(params.length>0);
  for(const p of params)assert.deepEqual(p.slice(0,3),[111,20,21]);
  if(operation==="append")assert.deepEqual(params.find(p=>p.length===9).slice(6),[head,"ci:failure",123]);
 }
});
