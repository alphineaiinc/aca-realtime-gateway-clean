"use strict";
const {test}=require("node:test");
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
