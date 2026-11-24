"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {ingressLimit}=require("../src/security/ingressLimit");
test("ingress bounds requests and tracked clients; expires windows",()=>{
 let now=0;const limit=ingressLimit({max:2,capacity:2,windowMs:1000,clock:()=>now});
 function hit(ip){let code=200;const res={status(n){code=n;return this},json(){},set(){}};limit({ip},res,()=>{});return code;}
 assert.equal(hit("a"),200);assert.equal(hit("a"),200);assert.equal(hit("a"),429);assert.equal(hit("b"),200);assert.equal(hit("c"),429);now=1000;assert.equal(hit("c"),200);assert.equal(hit("a"),200);
});
