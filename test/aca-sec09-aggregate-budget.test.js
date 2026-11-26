"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {ingressLimit}=require("../src/security/ingressLimit");
function hit(limit,ip){
 let status=204;
 const res={status(n){status=n;return this;},json(){return this;},set(){return this;}};
 limit({ip},res,()=>{});
 return status;
}
test("explicit aggregate budget survives rotating proxy IPs and isolates classes",()=>{
 let now=0;
 const twilio=ingressLimit({max:5,globalBudget:true,clock:()=>now});
 const stripe=ingressLimit({max:5,globalBudget:true,clock:()=>now});
 for(let i=1;i<=5;i++)assert.equal(hit(twilio,"192.0.2."+i),204);
 assert.equal(hit(twilio,"192.0.2.6"),429);
 assert.equal(hit(stripe,"192.0.2.6"),204);
 now=60000;
 assert.equal(hit(twilio,"192.0.2.6"),204);
});
test("default per-IP behavior remains independent",()=>{
 const limit=ingressLimit({max:1});
 assert.equal(hit(limit,"192.0.2.1"),204);
 assert.equal(hit(limit,"192.0.2.2"),204);
 assert.equal(hit(limit,"192.0.2.1"),429);
});
