'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const express=require('express');
test('dashboard diagnostic endpoints deny access before filesystem or network operations',async t=>{
 let io=0;
 const context={__dirname:path.join(__dirname,'../src/routes'),module:{exports:{}},require(n){
 if(n==='express-rate-limit')return require(n); if(n==='express')return express;if(n==='path')return path;
 if(n==='fs')return {existsSync(){io++;throw Error('unexpected read');}};
 if(n==='axios')return {get(){io++;throw Error('unexpected request');}};
 if(n==='../db/pool')return {};
 if(n==='../middleware/postgresRateLimit')return {createPostgresRateLimiter:()=> (req,res,next)=>next()};
 throw Error(n);
 },console:{error(){}},process:{env:{}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/routes/dashboard.js'),'utf8'),context);
 const app=express();app.use(context.module.exports);
 const server=app.listen(0,'127.0.0.1');t.after(()=>new Promise(r=>server.close(r)));await new Promise(r=>server.once('listening',r));
 for(const route of ['/data','/brain-status']){
 const response=await fetch('http://127.0.0.1:'+server.address().port+route,{headers:{authorization:'Bearer unverified','x-role':'admin'}});
 assert.equal(response.status,403);assert.equal((await response.json()).error,'Verified operator access required');
 }
 for(let i=0;i<29;i++){const response=await fetch('http://127.0.0.1:'+server.address().port+'/data');await response.arrayBuffer();if(i===28)assert.equal(response.status,429);}
 assert.equal(io,0);
});
