"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {Pool}=require("pg");
test("isolated product migration chain and verified onboarding",async()=>{
 const pool=new Pool({connectionString:"postgres://onboarding_test:onboarding_test_only@localhost:5432/onboarding_test"});
 try{
 await pool.query("CREATE TABLE public.master_tenants(id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,business_name TEXT,preferred_lang TEXT,region TEXT); CREATE TABLE public.billing_invoices(id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id INTEGER,amount_usd NUMERIC,status TEXT); CREATE TABLE public.analytics_events(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id INTEGER,event_type TEXT,quantity NUMERIC,unit TEXT,meta JSONB,created_at TIMESTAMP DEFAULT NOW());");
 for(const name of fs.readdirSync("migrations").filter(n=>/^0(0[7-9]|1[0-7])_.*\.sql$/.test(n)).sort())await pool.query(fs.readFileSync("migrations/"+name,"utf8"));
 const {issueChallenge}=require("../src/security/onboardingChallenge");
 const {provisionVerifiedBusiness}=require("../src/security/provisionVerifiedBusiness");
 const {prepareRouting}=require("../src/security/prepareRouting");
 const email="product-fixture@example.test",businessName="Disposable business";
 const {token,challenge}=issueChallenge({email,businessName});
 await pool.query("INSERT INTO public.onboarding_challenges(token_hash,purpose,email,business_name,expires_at) VALUES($1,$2,$3,$4,$5)",[challenge.tokenHash,challenge.purpose,email,businessName,new Date(challenge.expiresAt)]);
 const result=await provisionVerifiedBusiness({pool,token,email,businessName});assert.equal(result.ok,true);
 const tenantId=result.result.tenantId;
 assert.equal((await provisionVerifiedBusiness({pool,token,email,businessName})).ok,false);
 await prepareRouting(pool,{tenantId,workflowId:"generic",phoneNumber:"+14165550123"});
 const {rows}=await pool.query("SELECT i.is_active AS identity_active,r.is_active AS notification_active,n.is_active AS number_active,c.is_active AS workflow_active FROM aca_business_identities i JOIN aca_notification_recipients r USING(tenant_id) JOIN tenant_phone_numbers n USING(tenant_id) JOIN tenant_workflow_configs c USING(tenant_id) WHERE i.tenant_id=$1",[tenantId]);
 assert.deepEqual(rows,[{identity_active:true,notification_active:false,number_active:false,workflow_active:false}]);
 const {deliverOne}=require("../src/voice/requestNotificationWorker");
 const {createTenantResolver}=require("../src/voice/tenantResolver");
 const {saveConfirmedRequest}=require("../src/voice/confirmedRequestStore");
 const query=pool.query.bind(pool),resolve=createTenantResolver({query});
 const callSid="CA"+"a".repeat(32);
 assert.equal((await resolve({calledNumber:"+14165550123",callSid})).reason,"INACTIVE_NUMBER");
 await pool.query("UPDATE voice_workflow_definitions SET is_active=TRUE WHERE workflow_id='generic'; UPDATE tenant_workflow_configs SET is_active=TRUE; UPDATE tenant_phone_numbers SET is_active=TRUE");
 const context=await resolve({calledNumber:"+14165550123",callSid});
 assert.equal(context.ok,true);
 const intent=context.schema.intents[0];
 const slots=Object.fromEntries(intent.required_slots.map(k=>[k,k==="name"?"Disposable caller":"Fixture value"]));
 slots.tenant_id=999;
 const id=await saveConfirmedRequest(context,intent.intent,slots,query);
 assert.equal(await saveConfirmedRequest(context,intent.intent,slots,query),id);
 await assert.rejects(saveConfirmedRequest(context,intent.intent,{...slots,[intent.required_slots[0]]:"Changed fixture"},query),/REQUEST_CONFLICT/);
 await assert.rejects(saveConfirmedRequest({...context},intent.intent,slots,query),/INVALID_REQUEST_CONTEXT/);
 const stored=await pool.query("SELECT details FROM aca_customer_requests WHERE id=$1 AND tenant_id=$2",[id,tenantId]);
 assert.equal(stored.rows.length,1);assert.equal(stored.rows[0].details.tenant_id,undefined);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM aca_request_outbox WHERE request_id=$1",[id])).rows[0].n,1);
 let sent=0;
 const sendMail=async mail=>{sent++;assert.equal(mail.to,email);assert.ok(!mail.text.includes("Disposable caller"));return {accepted:[email]};};
 assert.equal(await deliverOne({pool,sendMail}),false);assert.equal(sent,0);
 await pool.query("UPDATE aca_notification_recipients SET is_active=TRUE WHERE tenant_id=$1",[tenantId]);
 await assert.rejects(deliverOne({pool,sendMail:async()=>({accepted:[]})}),/REQUEST_NOTIFICATION_FAILED/);
 assert.equal((await pool.query("SELECT delivered_at FROM aca_request_outbox WHERE request_id=$1",[id])).rows[0].delivered_at,null);
 // Transport exception must release the lock and preserve the undelivered request.
 await assert.rejects(deliverOne({pool,sendMail:async()=>{throw Error("simulated transport failure");}}),/REQUEST_NOTIFICATION_FAILED/);
 assert.equal((await pool.query("SELECT delivered_at FROM aca_request_outbox WHERE request_id=$1",[id])).rows[0].delivered_at,null);
 // Hold one simulated delivery open while a second worker attempts the same row.
 let enter,release;
 const entered=new Promise(r=>{enter=r;}),gate=new Promise(r=>{release=r;});
 let concurrentSends=0;
 const first=deliverOne({pool,sendMail:async mail=>{concurrentSends++;enter();await gate;return sendMail(mail);}});
 try{
 await Promise.race([entered,first.then(()=>{throw Error("worker exited before send");})]);
 assert.equal(await deliverOne({pool,sendMail:async()=>{concurrentSends++;throw Error("duplicate send");}}),false);
 }finally{release();await first;}
 assert.equal(concurrentSends,1);
 assert.ok((await pool.query("SELECT delivered_at FROM aca_request_outbox WHERE request_id=$1",[id])).rows[0].delivered_at);
 console.log("Notification transport failure recovery and concurrent worker exclusion passed");
 
 assert.equal(await deliverOne({pool,sendMail}),false);assert.equal(sent,1);
 const other=await pool.query("INSERT INTO master_tenants(business_name) VALUES('Other disposable tenant') RETURNING id");
 await prepareRouting(pool,{tenantId:other.rows[0].id,workflowId:"generic",phoneNumber:"+14165550124"});
 await pool.query("UPDATE tenant_workflow_configs SET is_active=TRUE; UPDATE tenant_phone_numbers SET is_active=TRUE");
 const otherContext=await resolve({calledNumber:"+14165550124",callSid});
 assert.equal(otherContext.tenantId,other.rows[0].id);
 const otherId=await saveConfirmedRequest(otherContext,intent.intent,slots,query);
 assert.notEqual(otherId,id);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM aca_customer_requests WHERE id=$1 AND tenant_id=$2",[id,otherContext.tenantId])).rows[0].n,0);
 await assert.rejects(pool.query("INSERT INTO aca_request_outbox(request_id,tenant_id) VALUES($1,$2)",[id,other.rows[0].id]));

// Real PostgreSQL permission denial with a transaction-local disposable role.
 const permissionClient=await pool.connect();
 try {
 await permissionClient.query("BEGIN");
 await permissionClient.query("CREATE ROLE aca_ci_acceptance_fixture NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE");
 await permissionClient.query("GRANT USAGE ON SCHEMA public TO aca_ci_acceptance_fixture");
 await permissionClient.query("GRANT SELECT ON public.master_tenants TO aca_ci_acceptance_fixture");
 await permissionClient.query("SET LOCAL ROLE aca_ci_acceptance_fixture");
 assert.equal((await permissionClient.query("SELECT current_user AS role")).rows[0].role,"aca_ci_acceptance_fixture");
 assert.ok((await permissionClient.query("SELECT count(*) FROM public.master_tenants")).rows.length===1);
 for(const sql of ["SELECT * FROM public.aca_business_identities","UPDATE public.master_tenants SET business_name='denied' WHERE false","DELETE FROM public.aca_customer_requests WHERE false","INSERT INTO public.aca_request_outbox(request_id,tenant_id) VALUES(0,0)"]){
 await permissionClient.query("SAVEPOINT denied_operation");
 await assert.rejects(permissionClient.query(sql),e=>e.code==="42501");
 await permissionClient.query("ROLLBACK TO SAVEPOINT denied_operation");
 }
 await permissionClient.query("ROLLBACK");
 assert.equal((await permissionClient.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname='aca_ci_acceptance_fixture'")).rows[0].n,0);
 console.log("Disposable restricted role: permitted read, four denied operations, rollback passed");
 }finally{await permissionClient.query("ROLLBACK");permissionClient.release();}
 
// Exercise every authored workflow against real PostgreSQL inside a rollback-only transaction.
 const fixtureClient=await pool.connect();
 try {
 await fixtureClient.query("BEGIN");
 const {workflowIds,buildWorkflowDefinition}=require("../src/voice/workflowDefinitionCatalog");
 const resolveFixture=createTenantResolver({query:fixtureClient.query.bind(fixtureClient)});
 assert.equal(workflowIds.filter(id=>id!=="generic").length,12);
 assert.equal(workflowIds.filter(id=>id==="generic").length,1);
 for(const [i,workflowId] of workflowIds.entries()){
 const schema=buildWorkflowDefinition(workflowId);
 const tenant=(await fixtureClient.query("INSERT INTO master_tenants(business_name) VALUES($1) RETURNING id",["Rollback fixture "+i])).rows[0].id;
 const phone="+1202555"+String(100+i).padStart(4,"0");
 await fixtureClient.query("INSERT INTO voice_workflow_definitions(workflow_id,version,schema_json,is_active) VALUES($1,$2,$3,true) ON CONFLICT(workflow_id,version) DO UPDATE SET is_active=true",[workflowId,schema.version,JSON.stringify(schema)]);
 await fixtureClient.query("INSERT INTO tenant_workflow_configs(tenant_id,workflow_id,workflow_version,is_active) VALUES($1,$2,$3,true)",[tenant,workflowId,schema.version]);
 await fixtureClient.query("INSERT INTO tenant_phone_numbers(phone_number,tenant_id,is_active) VALUES($1,$2,true)",[phone,tenant]);
 const input={calledNumber:phone,callSid:"CA"+i.toString(16).padStart(32,"0")};
 const ctx=await resolveFixture(input);
 assert.equal(ctx.ok,true);assert.equal(ctx.tenantId,tenant);assert.equal(ctx.clusterId,workflowId);
 assert.equal((await resolveFixture({...input,tenantId:tenantId})).reason,"UNTRUSTED_IDENTIFIER");
 const intent=ctx.schema.intents[0], values=Object.fromEntries(intent.required_slots.map(k=>[k,"Fixture "+k]));
 const q=fixtureClient.query.bind(fixtureClient);
 const saved=await saveConfirmedRequest(ctx,intent.intent,values,q);
 assert.equal(await saveConfirmedRequest(ctx,intent.intent,values,q),saved);
 assert.equal((await q("SELECT count(*)::int AS n FROM aca_request_outbox WHERE request_id=$1 AND tenant_id=$2",[saved,tenant])).rows[0].n,1);
 assert.equal((await q("SELECT count(*)::int AS n FROM aca_customer_requests WHERE id=$1 AND tenant_id=$2",[saved,tenantId])).rows[0].n,0);
 await q("UPDATE tenant_workflow_configs SET is_active=false WHERE tenant_id=$1",[tenant]);
 assert.equal((await resolveFixture(input)).reason,"INACTIVE_WORKFLOW");
 }
 await fixtureClient.query("ROLLBACK");
 assert.equal((await fixtureClient.query("SELECT count(*)::int AS n FROM master_tenants WHERE business_name LIKE 'Rollback fixture %'")).rows[0].n,0);
 console.log("All 12 industry and generic workflow assignments, tenant isolation, durable request idempotency and rollback passed");
 }finally{await fixtureClient.query("ROLLBACK");fixtureClient.release();}
 
// Real HTTP routes, actual disposable PostgreSQL, no external email.
const crypto=require("node:crypto"),jwt=require("jsonwebtoken"),express=require("express");
const secret=crypto.randomBytes(48).toString("hex");
process.env.JWT_SECRET=secret;
process.env.ACA_VERIFIED_LOGIN_ENABLED="true";
const poolPath=require.resolve("../src/db/pool");
const previous=require.cache[poolPath];
require.cache[poolPath]={id:poolPath,filename:poolPath,loaded:true,exports:pool};
const app=express();app.use(express.json());app.use("/tenant",require("../src/routes/tenant"));
const server=app.listen(0,"127.0.0.1");
try{
 await new Promise((resolve,reject)=>{server.once("listening",resolve);server.once("error",reject);});
 const origin="http://127.0.0.1:"+server.address().port;
 const request=async(path,token,body,localAddress="127.0.0.1")=>new Promise((resolve,reject)=>{
 const payload=body?JSON.stringify(body):null;
 const req=require("node:http").request(origin+path,{localAddress,method:body?"POST":"GET",headers:{...(token?{Authorization:"Bearer "+token}:{}),...(payload?{"Content-Type":"application/json","Content-Length":Buffer.byteLength(payload)}:{})}},res=>{
 let data="";res.setEncoding("utf8");res.on("data",chunk=>data+=chunk);res.on("end",()=>{try{resolve({status:res.statusCode,body:JSON.parse(data)});}catch(e){reject(e);}});res.on("error",reject);
 });req.on("error",reject);req.setTimeout(5000,()=>req.destroy(new Error("HTTP test timeout")));req.end(payload);
 });
 const otherEmail="other-product@example.test";
 await pool.query("INSERT INTO aca_business_identities(email,tenant_id,verified_at,is_active) VALUES($1,$2,NOW(),true)",[otherEmail,otherContext.tenantId]);
 const {issueLogin}=require("../src/security/verifiedBusinessLogin");
 const login=async(email)=>{let code;await issueLogin({query,email,sendMail:async mail=>{code=mail.text.match(/[a-f0-9]{64}/)[0];}});assert.ok(code);const result=await request("/tenant/login/redeem",null,{token:code});assert.equal(result.status,200);return {token:result.body.token,code};};
 const a=await login(email),b=await login(otherEmail);
 assert.equal((await request("/tenant/profile",a.token)).body.profile.tenant_id,tenantId);
 assert.equal((await request("/tenant/profile",b.token)).body.profile.tenant_id,otherContext.tenantId);
 assert.deepEqual((await request("/tenant/requests",a.token)).body.requests.map(x=>String(x.id)),[String(id)]);
 assert.deepEqual((await request("/tenant/requests",b.token)).body.requests.map(x=>String(x.id)),[String(otherId)]);
 const routingA=await request("/tenant/routing/status",a.token),routingB=await request("/tenant/routing/status",b.token);
 assert.equal(routingA.status,200);assert.equal(routingB.status,200);
 assert.deepEqual(routingA.body.routing.map(x=>x.phone_number),["+14165550123"]);
 assert.deepEqual(routingB.body.routing.map(x=>x.phone_number),["+14165550124"]);
 assert.equal((await request("/tenant/profile?tenant_id="+otherContext.tenantId,a.token)).body.profile.tenant_id,tenantId);
 assert.equal((await request("/tenant/profile","invalid-token")).status,401);
 let expiredCode;await issueLogin({query,email,sendMail:async mail=>{expiredCode=mail.text.match(/[a-f0-9]{64}/)[0];}});
 assert.ok(expiredCode);
 await pool.query("UPDATE aca_login_challenges SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1",[crypto.createHash("sha256").update(expiredCode).digest("hex")]);
 assert.equal((await request("/tenant/login/redeem",null,{token:expiredCode},"127.0.0.2")).status,401);
 assert.equal((await request("/tenant/login/redeem",null,{token:a.code},"127.0.0.2")).status,401);
 const forged=jwt.sign({tenant_id:otherContext.tenantId,sub:email,purpose:"verified_business"},secret,{algorithm:"HS256",issuer:"alphine-ai",audience:"aca-business",expiresIn:"1h"});
 assert.equal((await request("/tenant/profile",forged)).status,401);
 await pool.query("UPDATE aca_business_identities SET is_active=false WHERE email=$1",[email]);
 assert.equal((await request("/tenant/profile",a.token)).status,401);
 console.log("Authenticated HTTP acceptance: two identities, scoped profiles and requests, replay, mismatch and revocation passed");
}finally{await new Promise(resolve=>server.close(resolve));if(previous)require.cache[poolPath]=previous;else delete require.cache[poolPath];delete process.env.JWT_SECRET;delete process.env.ACA_VERIFIED_LOGIN_ENABLED;}
 }finally{await pool.end();}
});
