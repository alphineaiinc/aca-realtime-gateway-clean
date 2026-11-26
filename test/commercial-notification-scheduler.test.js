"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {start}=require("../src/voice/commercialNotificationScheduler");
const env=()=>({ACA_PRODUCTION_EMAIL_SCHEDULER:"true",ACA_PRODUCTION_EMAIL_ENABLED:"true",RENDER_SERVICE_ID:"srv-d3rfh8umcj7s73cj28c0",ACA_PRODUCTION_EMAIL_DATABASE:"fixture"});
function fixture(e,deliver,onError){
 const timers=new Map();let seq=0;
 const scheduler=start({env:e,pool:{},deliver,onError,schedule:(fn,ms)=>{assert.equal(ms,60000);timers.set(++seq,fn);return seq;},cancel:id=>timers.delete(id)});
 return {timers,scheduler,tick(){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}};
}
const flush=()=>new Promise(r=>setImmediate(r));
test("scheduler requires all commercial flags and rejects staging",async()=>{
 for(const e of [{},{...env(),ACA_PRODUCTION_EMAIL_ENABLED:"false"},{...env(),RENDER_SERVICE_ID:"wrong"},{...env(),ACA_STAGING_EMAIL_ONLY:"true"},{...env(),ACA_PRODUCTION_EMAIL_DATABASE:"aca_product_staging"}]){
 const f=fixture(e,()=>assert.fail("unexpected send"));assert.equal(f.timers.size,0);await f.scheduler.stop();
 }
});
test("scheduler serializes ticks and stops while delivery is active",async()=>{
 let release,calls=0;const gate=new Promise(r=>release=r);
 const f=fixture(env(),async()=>{calls++;await gate;});
 f.tick();await flush();assert.equal(calls,1);assert.equal(f.timers.size,0);
 const stopped=f.scheduler.stop();release();await stopped;assert.equal(f.timers.size,0);
});
test("scheduler handles errors, revocation and cancellation",async()=>{
 const e=env();let errors=0,calls=0;
 const f=fixture(e,async()=>{calls++;throw Error("private");},()=>errors++);
 f.tick();await flush();assert.equal(errors,1);assert.equal(f.timers.size,1);
 e.ACA_PRODUCTION_EMAIL_ENABLED="false";f.tick();await flush();assert.equal(calls,1);assert.equal(f.timers.size,0);
 const g=fixture(env(),()=>assert.fail("unexpected send"));await g.scheduler.stop();assert.equal(g.timers.size,0);
});
