"use strict";
// Disposable PostgreSQL: real nonce INSERT + advisory decision persistence
// through the private owner intent handler. No network listener or deployment.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {Pool}=require("pg");
const {generateKeyPairSync}=require("node:crypto");
const {createCorrectionHandoff}=require("../src/automation/phase2aCorrectionHandoff");
const {createPendingDecision}=require("../src/automation/phase2aOwnerDecisionStore");
const {createOwnerEdgeNonceStore}=require("../src/automation/phase2aOwnerEdgeNonceStore");
const {issueOwnerEdgeProof}=require("../src/automation/phase2aOwnerEdgeProof");
const https=require("node:https"),os=require("node:os"),crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const {createIsolatedMtlsListener}=require("../src/automation/phase2aIsolatedMtlsListener");
const {createMtlsTransportVerifier}=require("../src/automation/phase2aMtlsTransport");
const {handlePrivateOwnerHttp}=require("../src/automation/phase2aPrivateOwnerHttp");
function generate(dir,name,ca=null){
 const key=path.join(dir,name+".key"),csr=path.join(dir,name+".csr"),
  cert=path.join(dir,name+".crt");
 const run=(...a)=>execFileSync("openssl",a,{cwd:dir,stdio:"pipe"});
 if(!ca)run("req","-x509","-newkey","rsa:2048","-nodes","-keyout",key,
  "-out",cert,"-days","1","-subj","/CN="+name);
 else{
  run("req","-newkey","rsa:2048","-nodes","-keyout",key,
   "-out",csr,"-subj","/CN="+name);
  run("x509","-req","-in",csr,"-CA",path.join(dir,ca+".crt"),
   "-CAkey",path.join(dir,ca+".key"),"-CAcreateserial","-out",cert,"-days","1");
 }
 return {key:fs.readFileSync(key,"utf8"),cert:fs.readFileSync(cert,"utf8")};
}
function send(port,{cert,key,ca,body,headers={},path:route="/phase2a/internal/owner-intent"}={}){
 return new Promise(resolve=>{
  const req=https.request({hostname:"127.0.0.1",servername:"localhost",port,
   method:"POST",path:route,cert,key,ca,rejectUnauthorized:true,
   headers:{"content-type":"application/json",...headers}},res=>{
    let response="";res.on("data",x=>response+=x);
    res.on("end",()=>resolve({status:res.statusCode,
     data:JSON.parse(response)}));
  });
  req.on("error",e=>resolve({error:e.code||e.message}));
  req.end(JSON.stringify(body||{}));
 });
}

const R=1080201236,OWNER=230486228,W=422174901,HEAD="a".repeat(40);
function handoff(){
 return createCorrectionHandoff({event:{action:"completed",repository:{id:R},
 workflow_run:{id:551,name:"ACA CI",workflow_id:W,status:"completed",
 conclusion:"failure",head_sha:HEAD,repository:{id:R},head_repository:{id:R}}},
 expectedRepositoryId:R,expectedWorkflowId:W,verifiedIssueLink:true,
 pr:{state:"open",draft:false,number:249,issueNumber:248,headSha:HEAD,
 repositoryId:R,baseRepositoryId:R},
 history:{attempts:0,unchangedFailureCount:0,headSha:HEAD,
 repositoryId:R,prNumber:249,issueNumber:248}});
}
function migration(name){return fs.readFileSync(path.join(__dirname,"../migrations",name),"utf8");}
function inert(x){
 for(const k of ["agentDispatchAuthorized","dispatched","mergeAuthorized",
 "deployAuthorized","signingAuthorized","productionAuthorization"])
 assert.equal(x[k],false,k);
}
if(!process.env.ACA_TEST_DATABASE_URL){
 test("combined private advisory SQL requires disposable ACA_TEST_DATABASE_URL",{skip:true},()=>{});
}else{
 test("real mTLS + disposable SQL: owner intent persisted, replay denied",{timeout:45000},async()=>{
  const admin=new Pool({connectionString:process.env.ACA_TEST_DATABASE_URL,max:2});
  let writer,nonceWriter,server,dir;
  try{
   for(const name of ["aca_automation_correction_ledger.sql",
    "aca_automation_role_policy.sql"])await admin.query(migration(name));
   const policies=await admin.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='aca_automation' AND policyname='aca_ledger_read'");
   if(policies.rows[0].n===0)await admin.query(migration("aca_automation_repository_rls.sql"));
   await admin.query(migration("aca_phase2a_owner_decisions_staging.sql"));
   const decisionPolicies=await admin.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='aca_automation' AND policyname='aca_owner_decision_read'");
   if(decisionPolicies.rows[0].n===0)
    await admin.query(migration("aca_phase2a_owner_decisions_role_policy.sql"));
   const noncePolicies=await admin.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='aca_automation' AND policyname='aca_owner_edge_nonce_create'");
   if(noncePolicies.rows[0].n===0)
    await admin.query(migration("aca_phase2a_owner_edge_nonce_staging.sql"));
   await admin.query(`DO $body$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aca_ci_combined_decision') THEN
     CREATE ROLE aca_ci_combined_decision LOGIN PASSWORD 'aca_ci_fixture_only'
      IN ROLE aca_owner_decision_writer;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aca_ci_combined_nonce') THEN
     CREATE ROLE aca_ci_combined_nonce LOGIN PASSWORD 'aca_ci_fixture_only'
      IN ROLE aca_owner_edge_nonce_writer;
    END IF;
   END $body$`);
   await admin.query("INSERT INTO aca_automation.repository_role_scopes(login_role,repository_id) VALUES ('aca_ci_combined_decision',$1) ON CONFLICT DO NOTHING",[R]);
   const asRole=name=>{const url=new URL(process.env.ACA_TEST_DATABASE_URL);
    url.username=name;url.password="aca_ci_fixture_only";
    return new Pool({connectionString:url.toString(),max:2});};
   writer=asRole("aca_ci_combined_decision");
   nonceWriter=asRole("aca_ci_combined_nonce");
   const current=handoff(),now=Date.now();
   const pending=await createPendingDecision(writer,{handoff:current,repositoryId:R,ownerId:OWNER,now});
   assert.equal(pending.state,"pending",JSON.stringify(pending));inert(pending);
   const {privateKey,publicKey}=generateKeyPairSync("ed25519");
   const proof=issueOwnerEdgeProof({issuer:"aca-public-edge",audience:"aca-private-owner",
    repositoryId:R,ownerId:OWNER,requestId:pending.packet.id,decision:"approve",
    privateKey,now:now-1000});
   const body={decision:"approve",requestId:pending.packet.id,proof};
   const nonceStore=createOwnerEdgeNonceStore({pool:nonceWriter});
   dir=fs.mkdtempSync(path.join(os.tmpdir(),"aca-mtls-sql-"));
   const ca=generate(dir,"rootCA"),srv=generate(dir,"localhost","rootCA"),
    approvedClient=generate(dir,"approved","rootCA"),wrongClient=generate(dir,"wrong","rootCA");
   const fingerprint=new crypto.X509Certificate(approvedClient.cert).fingerprint256;
   const verifyTransport=createMtlsTransportVerifier({clientFingerprint256:fingerprint});
   const dependencies={expectedIssuer:"aca-public-edge",expectedAudience:"aca-private-owner",
    repositoryId:R,ownerId:OWNER,publicKey,nonceStore,decisionClient:writer,
    loadPendingPacket:async()=>pending.packet,loadFreshHandoff:async()=>handoff(),now:now+200};
   server=createIsolatedMtlsListener({serverKey:srv.key,serverCert:srv.cert,
    clientCa:ca.cert,clientFingerprint256:fingerprint,
    onAuthorizedRequest:(req,res)=>handlePrivateOwnerHttp(req,res,{verifyTransport,dependencies})});
   await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
   const port=server.address().port;
   const approved=await send(port,{cert:approvedClient.cert,key:approvedClient.key,ca:ca.cert,body});
   assert.equal(approved.status,200,JSON.stringify(approved));
   assert.equal(approved.data.state,"owner_intent_to_review");inert(approved.data);
   const replay=await send(port,{cert:approvedClient.cert,key:approvedClient.key,ca:ca.cert,body});
   assert.equal(replay.status,409);inert(replay.data);
   const spoof=await send(port,{cert:wrongClient.cert,key:wrongClient.key,ca:ca.cert,
    body,headers:{"x-forwarded-client-cert":fingerprint}});
   assert.equal(spoof.status,403);inert(spoof.data);
   const row=await admin.query("SELECT state FROM aca_automation.owner_decision_requests WHERE request_id=$1",[pending.packet.id]);
   assert.equal(row.rows.length,1);assert.equal(row.rows[0].state,"approved_intent");
   const events=await admin.query("SELECT event_type FROM aca_automation.owner_decision_events WHERE request_id=$1 ORDER BY occurred_at",[pending.packet.id]);
   assert.deepEqual(events.rows.map(x=>x.event_type),["created","approved_intent"]);
   const nonceCount=await admin.query("SELECT count(*)::int AS n FROM aca_automation.owner_edge_proof_nonces WHERE repository_id=$1",[R]);
   assert.ok(nonceCount.rows[0].n>=1);
   await assert.rejects(nonceWriter.query("SELECT * FROM aca_automation.owner_edge_proof_nonces"),/permission denied/);
  }finally{
   await Promise.allSettled([writer?.end(),nonceWriter?.end()]);
   await admin.end();
  }
 });
}
