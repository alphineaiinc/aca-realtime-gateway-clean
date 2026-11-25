"use strict";
const {test,before,after}=require("node:test");
const scope={ACA_STAGING_EMAIL_ONLY:"true",ACA_STAGING_EMAIL_TENANT_ID:"7",ACA_STAGING_EMAIL_REQUEST_ID:"1",ACA_STAGING_EMAIL_RECIPIENT:"business@example.test"};
const saved=Object.fromEntries(Object.keys(scope).map(k=>[k,process.env[k]]));
before(()=>Object.assign(process.env,scope));
after(()=>{for(const k of Object.keys(scope)){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}});
const assert=require("node:assert/strict");
const {deliverOne}=require("../src/voice/requestNotificationWorker");
function fixture(eligible=true){
 const state={reserved:false,delivered:false,uncertain:false,queries:[],released:0,sends:0};
 const row={request_id:1,tenant_id:7,email:"business@example.test",message_id:"<aca-request-7-1@alphineai.com>"};
 const query=async(sql,params)=>{
  state.queries.push([sql,params]);
  if(sql.includes("INSERT INTO public.aca_request_email_reservations")){
   if(!eligible||state.reserved)return {rows:[]};
   state.reserved=true;return {rows:[row]};
  }
  if(sql.includes("SET state=$3"))state.uncertain=true;
  if(sql.includes("UPDATE public.aca_request_outbox"))state.delivered=true;
  return {rows:[]};
 };
 return {state,pool:{query,connect:async()=>({query,release:()=>state.released++})},row};
}
test("reservation commits before provider send and only one send occurs",async()=>{
 const f=fixture();
 assert.equal(await deliverOne({pool:f.pool,sendMail:async mail=>{
  f.state.sends++;assert.equal(f.state.reserved,true);
  assert.equal(mail.messageId,f.row.message_id);
  assert.match(mail.text,/Sign in/);assert.equal(mail.details,undefined);
  return {accepted:[mail.to]};}}),true);
 assert.equal(await deliverOne({pool:f.pool,sendMail:async()=>{throw Error("duplicate");}}),false);
 assert.equal(f.state.sends,1);assert.equal(f.state.delivered,true);
 assert.ok(f.state.queries.some(([q,p])=>q.includes("UPDATE public.aca_request_outbox")&&p[1]===7));
});
test("provider error or timeout is uncertain and blocks automatic retries",async()=>{
 const f=fixture();
 await assert.rejects(deliverOne({pool:f.pool,sendMail:async()=>{throw Error("provider token and secret");}}),{message:"REQUEST_NOTIFICATION_UNCERTAIN"});
 assert.equal(f.state.uncertain,true);assert.equal(f.state.delivered,false);
 assert.equal(await deliverOne({pool:f.pool,sendMail:async()=>{throw Error("must not send");}}),false);
});
test("no eligible recipient does not initialize provider",async()=>{
 const f=fixture(false);
 assert.equal(await deliverOne({pool:f.pool,sendMail:async()=>{throw Error("unexpected");}}),false);
});
test("acknowledgement failure does not permit second send",async()=>{
 const f=fixture();const original=f.pool.connect;
 f.pool.connect=async()=>{const c=await original();const base=c.query;c.query=async(sql,p)=>{if(sql.includes("UPDATE public.aca_request_outbox"))throw Error("db failure");return base(sql,p);};return c;};
 await assert.rejects(deliverOne({pool:f.pool,sendMail:async mail=>({accepted:[mail.to]})}),{message:"REQUEST_ACK_FAILED"});
 assert.equal(await deliverOne({pool:f.pool,sendMail:async()=>{throw Error("duplicate");}}),false);
});

test("staging scope binds exact recipient, tenant and request before provider access",async()=>{
 const keys=["ACA_STAGING_EMAIL_ONLY","ACA_STAGING_EMAIL_TENANT_ID","ACA_STAGING_EMAIL_REQUEST_ID","ACA_STAGING_EMAIL_RECIPIENT"];
 const previous=keys.map(k=>process.env[k]);
 try{
  process.env[keys[0]]="true";process.env[keys[1]]="7";process.env[keys[2]]="1";process.env[keys[3]]="business@example.test";
  const f=fixture(false);
  assert.equal(await deliverOne({pool:f.pool,sendMail:async()=>{throw Error("unexpected");}}),false);
  const [sql,params]=f.state.queries[0];
  assert.deepEqual(params,[true,"7","1","business@example.test"]);
  assert.ok(sql.includes("current_database() = 'aca_product_staging'"));
  assert.ok(sql.includes("r.email=$4::text"));
  assert.ok(sql.includes("staging_attempt"));
  delete process.env[keys[3]];
  assert.equal(await deliverOne({pool:{connect:async()=>{throw Error("must not connect");}}}),false);
 }finally{keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});

test("injected runtime transport cannot bypass staging entitlement",async()=>{
 const {spawnSync}=require("node:child_process");
 const env={...process.env};
 for(const k of ["NODE_TEST_CONTEXT","ACA_STAGING_EMAIL_ONLY","ACA_STAGING_EMAIL_TENANT_ID","ACA_STAGING_EMAIL_REQUEST_ID","ACA_STAGING_EMAIL_RECIPIENT"])delete env[k];
 const script=`const {deliverOne}=require("./src/voice/requestNotificationWorker");deliverOne({pool:{connect:async()=>{throw Error("unexpected DB access")}},sendMail:async()=>{throw Error("unexpected provider access")}}).then(v=>{if(v!==false)process.exitCode=1}).catch(()=>{process.exitCode=1});`;
 for(const context of [undefined,"child-v8","forged"]){
  if(context===undefined)delete env.NODE_TEST_CONTEXT;else env.NODE_TEST_CONTEXT=context;
  const result=spawnSync(process.execPath,["-e",script],{cwd:require("node:path").resolve(__dirname,".."),env,encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
 }
});

test("commercial entitlement is disabled by default and fenced to service and database",async()=>{
 const keys=["ACA_STAGING_EMAIL_ONLY","ACA_PRODUCTION_EMAIL_ENABLED","RENDER_SERVICE_ID","ACA_PRODUCTION_EMAIL_DATABASE","ACA_STAGING_ACCEPTANCE_RUN","ACA_STAGING_ACCEPTANCE_SEND"];
 const old=keys.map(k=>process.env[k]);
 try{
 keys.forEach(k=>delete process.env[k]);
 const denied={connect:async()=>{throw Error("unexpected database access");}};
 assert.equal(await deliverOne({pool:denied}),false);
 process.env.ACA_PRODUCTION_EMAIL_ENABLED="true";
 process.env.ACA_PRODUCTION_EMAIL_DATABASE="commercial_test";
 assert.equal(await deliverOne({pool:denied}),false);
 process.env.RENDER_SERVICE_ID="srv-d3rfh8umcj7s73cj28c0";
 process.env.ACA_PRODUCTION_EMAIL_DATABASE="aca_product_staging";
 assert.equal(await deliverOne({pool:denied}),false);
 process.env.ACA_PRODUCTION_EMAIL_DATABASE="commercial_test";
 process.env.ACA_STAGING_ACCEPTANCE_SEND="true";
 assert.equal(await deliverOne({pool:denied}),false);
 delete process.env.ACA_STAGING_ACCEPTANCE_SEND;
 const f=fixture(false);
 assert.equal(await deliverOne({pool:f.pool,sendMail:async()=>{throw Error("unexpected send");}}),false);
 const [sql,params]=f.state.queries[0];
 assert.deepEqual(params,[false,null,null,"commercial_test"]);
 assert.ok(sql.includes("current_database() = $4::text AND current_database() <> 'aca_product_staging'"));
 }finally{keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
