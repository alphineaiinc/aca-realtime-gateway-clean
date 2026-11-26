'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ingressLimit}=require('../src/security/ingressLimit');
test('unverified bearer rotation cannot reset IP budget and capacity fails closed',()=>{
 let now=0;
 const limit=ingressLimit({max:2,capacity:2,windowMs:1000,clock:()=>now});
 function invoke(ip,authorization){
  let status=200;
  const res={status(n){status=n;return this;},json(){},set(){}};
  limit({ip,headers:{authorization}},res,()=>{});
  return status;
 }
 assert.equal(invoke('192.0.2.1','Bearer a'),200);
 assert.equal(invoke('192.0.2.1','Bearer b'),200);
 assert.equal(invoke('192.0.2.1','Bearer c'),429);
 assert.equal(invoke('192.0.2.2',''),200);
 assert.equal(invoke('192.0.2.3',''),429);
 now=1001;
 assert.equal(invoke('192.0.2.3',''),200);
});
