const test=require("node:test");
const assert=require("node:assert/strict");
const express=require("express");
const jwt=require("jsonwebtoken");
test("dashboard denies unauthorized access and never returns raw logs",async t=>{
 const old=process.env.JWT_SECRET;process.env.JWT_SECRET="synthetic-dashboard-test-secret";
 const app=express();app.use("/dashboard",require("../src/routes/dashboard"));
 const server=app.listen(0,"127.0.0.1");
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old;});
 await new Promise(resolve=>server.once("listening",resolve));
 const base="http://127.0.0.1:"+server.address().port+"/dashboard";
 const headers=role=>({authorization:"Bearer "+jwt.sign({role},process.env.JWT_SECRET)});
 for(const path of ["/","/data","/brain-status"]){
 assert.equal((await fetch(base+path)).status,401);
 assert.equal((await fetch(base+path,{headers:headers("partner")})).status,403);
 }
 const response=await fetch(base+"/data",{headers:headers("admin")});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{entries:[],rawLogsAvailable:false});
 assert.equal((await fetch(base+"/brain-status",{headers:headers("admin")})).status,503);
});
