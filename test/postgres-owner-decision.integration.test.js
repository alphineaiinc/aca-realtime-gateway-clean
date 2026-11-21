"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {Pool}=require("pg");
const {createPendingDecision,persistOwnerIntent}=
 require("../src/automation/phase2aOwnerDecisionStore");
const {createCorrectionHandoff}=require("../src/automation/phase2aCorrectionHandoff");
const R=881077,W=422174901,OWNER=230486228,HEAD="a".repeat(40);
const migration=name=>fs.readFileSync(path.join(__dirname,"../migrations",name),"utf8");
function handoff(issue=79,pr=80){
 return createCorrectionHandoff({
  event:{action:"completed",repository:{id:R},workflow_run:{
   id:5511,name:"ACA CI",workflow_id:W,status:"completed",conclusion:"failure",
   head_sha:HEAD,repository:{id:R},head_repository:{id:R}}},
  expectedRepositoryId:R,expectedWorkflowId:W,verifiedIssueLink:true,
  pr:{state:"open",draft:false,number:pr,issueNumber:issue,headSha:HEAD,
   repositoryId:R,baseRepositoryId:R},
  history:{attempts:0,unchangedFailureCount:0,headSha:HEAD,
   repositoryId:R,prNumber:pr,issueNumber:issue}
 });
}
const inert=x=>{for(const k of ["agentDispatchAuthorized","dispatched",
 "mergeAuthorized","deployAuthorized","signingAuthorized","productionAuthorization"])
 assert.equal(x[k],false,k);};
if(!process.env.ACA_TEST_DATABASE_URL){
 test("owner intent PostgreSQL proof requires isolated ACA_TEST_DATABASE_URL",
 {skip:true},()=>{});
}else{
 test("real PostgreSQL: RLS isolation, concurrent approve/reject, replay, audit immutability",async()=>{
  const admin=new Pool({connectionString:process.env.ACA_TEST_DATABASE_URL,max:2});
  let writerA,writerB,reader;
  try{
   // CI database is disposable, never a connected Neon or production DB.
   await admin.query(migration("aca_automation_correction_ledger.sql"));
   await admin.query(migration("aca_automation_role_policy.sql"));
   const existingRls=await admin.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='aca_automation' AND policyname='aca_ledger_read'");
   if(existingRls.rows[0].n===0)
    await admin.query(migration("aca_automation_repository_rls.sql"));
   await admin.query(migration("aca_phase2a_owner_decisions_staging.sql"));
   await admin.query(migration("aca_phase2a_owner_decisions_role_policy.sql"));
   await admin.query(`DO $body$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aca_ci_owner_writer_a') THEN
     CREATE ROLE aca_ci_owner_writer_a LOGIN PASSWORD 'aca_ci_local_only' IN ROLE aca_owner_decision_writer;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aca_ci_owner_writer_b') THEN
     CREATE ROLE aca_ci_owner_writer_b LOGIN PASSWORD 'aca_ci_local_only' IN ROLE aca_owner_decision_writer;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aca_ci_owner_reader') THEN
     CREATE ROLE aca_ci_owner_reader LOGIN PASSWORD 'aca_ci_local_only' IN ROLE aca_automation_reader;
    END IF;
   END $body$`);
   await admin.query("INSERT INTO aca_automation.repository_role_scopes(login_role,repository_id) VALUES ('aca_ci_owner_writer_a',$1),('aca_ci_owner_writer_b',$2),('aca_ci_owner_reader',$1) ON CONFLICT DO NOTHING",[R,R+1]);
   const asRole=(user)=>{const url=new URL(process.env.ACA_TEST_DATABASE_URL);
    url.username=user;url.password="aca_ci_local_only";return new Pool({
     connectionString:url.toString(),max:4});
   };
   writerA=asRole("aca_ci_owner_writer_a");
   writerB=asRole("aca_ci_owner_writer_b");
   reader=asRole("aca_ci_owner_reader");
   const ident=(await writerA.query("SELECT session_user,current_user")).rows[0];
   assert.equal(ident.session_user,"aca_ci_owner_writer_a");
   assert.equal(ident.current_user,"aca_ci_owner_writer_a");
   const permissions=(await writerA.query(`SELECT
    has_table_privilege(current_user,'aca_automation.owner_decision_requests','INSERT') AS insert_request,
    has_table_privilege(current_user,'aca_automation.owner_decision_events','UPDATE') AS mutate_events`)).rows[0];
   assert.equal(permissions.insert_request,true);
   assert.equal(permissions.mutate_events,false);
   await assert.rejects(reader.query("SELECT * FROM aca_automation.owner_decision_requests"),/permission denied/);
   const scope={repositoryId:R,ownerId:OWNER,now:Date.now()};
   const initClient=await writerA.connect();
   let created;
   try{created=await createPendingDecision(initClient,{...scope,handoff:handoff()});}
   finally{initClient.release();}
   assert.equal(created.state,"pending");inert(created);
   const packet=created.packet;
   const a=await writerA.connect(),b=await writerA.connect();
   let decisions;
   try{
    decisions=await Promise.all([
     persistOwnerIntent(a,{packet,decision:"approve",actorId:OWNER,
      currentHandoff:handoff(),repositoryId:R,now:scope.now+1000}),
     persistOwnerIntent(b,{packet,decision:"reject",actorId:OWNER,
      currentHandoff:handoff(),repositoryId:R,now:scope.now+1000})
    ]);
   }finally{a.release();b.release();}
   const winning=decisions.filter(x=>["owner_intent_to_review","owner_rejected"].includes(x.state));
   assert.equal(winning.length,1,JSON.stringify(decisions));
   decisions.forEach(inert);
   const audit=(await writerA.query(`SELECT event_type FROM
    aca_automation.owner_decision_events WHERE request_id=$1 ORDER BY occurred_at`,[packet.id])).rows;
   assert.equal(audit.length,2);
   assert.equal(audit[0].event_type,"created");
   assert.ok(["approved_intent","rejected"].includes(audit[1].event_type));
   const replayClient=await writerA.connect();
   try{
    const replay=await persistOwnerIntent(replayClient,{packet,
     decision:"approve",actorId:OWNER,currentHandoff:handoff(),
     repositoryId:R,now:scope.now+2000});
    assert.equal(replay.state,"blocked");inert(replay);
   }finally{replayClient.release();}
   await assert.rejects(writerA.query(`UPDATE aca_automation.owner_decision_events
      SET event_type='created' WHERE request_id=$1`,[packet.id]),/permission denied/);
   // Scoped role cannot see rows for a different repository even if it has SELECT.
   const foreign=(await writerB.query(`SELECT request_id FROM
     aca_automation.owner_decision_requests WHERE request_id=$1`,[packet.id])).rows;
   assert.equal(foreign.length,0);
   const blockedClient=await writerB.connect();
   try{
    const blocked=await createPendingDecision(blockedClient,{...scope,
     handoff:handoff(90,91)});
    assert.equal(blocked.state,"blocked");inert(blocked);
   }finally{blockedClient.release();}
  }finally{
   await Promise.allSettled([writerA?.end(),writerB?.end(),reader?.end()]);
   await admin.end();
  }
 });
}
