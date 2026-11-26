const test=require("node:test"),assert=require("node:assert/strict");
test("commercial negative checks are bounded and distinguish disabled providers",async()=>{
 const {checks,run}=await import("../integration/aca-commercial-negative.mjs");
 assert.equal(checks.length,14);
 let i=0;
 const result=await run(async(url,opts)=>{
 const c=checks[i++];assert.equal(url,"https://alphine-aca-product-staging.onrender.com"+c.path);assert.equal(opts.redirect,"manual");assert.equal(opts.method,c.method);
 return {status:c.expected.at(-1)};
 },()=>{});
 assert.deepEqual(result,{failed:0,disabled:4,total:14});
});
test("unexpected success and transport errors fail acceptance",async()=>{
 const {checks,run}=await import("../integration/aca-commercial-negative.mjs");
 let i=0;const r=await run(async()=>{if(i++===0)throw Error("offline");return {status:200};},()=>{});
 assert.equal(r.failed,checks.length);
});
