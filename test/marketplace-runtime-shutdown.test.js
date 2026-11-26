"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {mountRuntimeMarketplace}=require("../src/marketplace/runtimePools");
const {createShutdown}=require("../src/voice/boundedShutdown");
const env={ACA_MARKETPLACE_ENABLED:"true",ACA_MARKETPLACE_LOCAL_ISSUER_ENABLED:"true",DATABASE_URL:"postgres://main:fixture@localhost/db",ACA_MARKETPLACE_RESOURCE_DATABASE_URL:"postgres://resource:fixture@localhost/db",ACA_MARKETPLACE_ISSUER_DATABASE_URL:"postgres://issuer:fixture@localhost/db"};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options=env){
 const pools=[],events=[];
 const runtime=mountRuntimeMarketplace({},options,{createPool:()=>{let release;const pending=new Promise(r=>release=r);const pool={calls:0,release,end(){this.calls++;events.push("end");return pending;}};pools.push(pool);return pool;},mount:(_app,args)=>{assert.equal(args.resourcePool,pools[0]);assert.equal(args.issuerPool,pools[1]);}});
 return {runtime,pools,events};
}
test("marketplace disabled creates no pools and exposes idempotent no-op cleanup",async()=>{
 const {runtime,pools}=fixture({});assert.equal(pools.length,0);const p=runtime.close();assert.equal(runtime.close(),p);await p;
});
test("both owned marketplace pools drain pending operations before successful bounded shutdown",async()=>{
 const {runtime,pools}=fixture();let code;let mainEnds=0;
 const shutdown=createShutdown({stop:()=>{},close:()=>{},snapshot:()=>{},end:()=>Promise.all([Promise.resolve().then(()=>mainEnds++),runtime.close()]),exit:c=>code=c,timeoutMs:1000});
 const p=shutdown();await tick();assert.equal(mainEnds,1);assert.deepEqual(pools.map(x=>x.calls),[1,1]);assert.equal(code,undefined);
 const cleanup=runtime.close();assert.equal(runtime.close(),cleanup);pools[0].release();await tick();assert.equal(code,undefined);pools[1].release();await p;assert.equal(code,0);assert.deepEqual(pools.map(x=>x.calls),[1,1]);
});
test("external issuer creates and drains resource pool only",async()=>{
 const {runtime,pools}=fixture({...env,ACA_MARKETPLACE_LOCAL_ISSUER_ENABLED:"false"});assert.equal(pools.length,1);const p=runtime.close();await tick();pools[0].release();await p;assert.equal(pools[0].calls,1);
});
test("hung marketplace pool enforces existing shutdown deadline",async()=>{
 const {runtime,pools}=fixture();let code;const exited=new Promise(resolve=>{createShutdown({stop:()=>{},close:()=>{},snapshot:()=>{},end:runtime.close,exit:c=>{code=c;resolve()},timeoutMs:30})();});
 await exited;assert.equal(code,1);assert.deepEqual(pools.map(x=>x.calls),[1,1]);
});
test("pool cleanup failure still attempts both owned pools and rejects",async()=>{
 let count=0;const runtime=mountRuntimeMarketplace({},env,{mount:()=>{},createPool:()=>({end(){if(++count===1)throw Error("fixture failure");}})});
 await assert.rejects(runtime.close(),/MARKETPLACE_POOL_CLEANUP_FAILED/);assert.equal(count,2);await assert.rejects(runtime.close());assert.equal(count,2);
});
test("application wires marketplace cleanup into the actual bounded shutdown end callback",()=>{
 const source=require("node:fs").readFileSync(require("node:path").join(__dirname,"../index.js"),"utf8");
 assert.match(source,/const marketplaceRuntime = require\("\.\/src\/marketplace\/runtimePools"\)\.mountRuntimeMarketplace/);
 assert.match(source,/end: async \(\) => \{\s*const results = await Promise\.allSettled\(\[\s*Promise\.resolve\(\)\.then\(\(\) => require\("\.\/src\/db\/pool"\)\.end\(\)\),\s*Promise\.resolve\(\)\.then\(\(\) => marketplaceRuntime\.close\(\)\)/);
});
