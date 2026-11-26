"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {proxyPolicy}=require("../src/security/proxyPolicy");
const express=require("express");
test("proxy policy defaults to no trust and rejects broad or malformed configuration",()=>{
 assert.equal(proxyPolicy()("127.0.0.1"),false);
 for(const x of ["0.0.0.0/0","::/0","bad/24","10.0.0.0/33"])assert.throws(()=>proxyPolicy(x));
 const trust=proxyPolicy("10.0.0.0/24,2001:db8::/64");
 assert.equal(trust("10.0.0.4"),true);
 assert.equal(trust("10.0.1.4"),false);
 assert.equal(trust("2001:db8::1"),true);
});
test("Express ignores forged forwarding from an untrusted peer and stops at first untrusted hop",async t=>{
 const app=express();app.set("trust proxy",proxyPolicy());
 app.get("/",(req,res)=>res.json({ip:req.ip}));
 const server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));
 t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r));});
 const url="http://127.0.0.1:"+server.address().port;
 const request=()=>fetch(url,{headers:{"x-forwarded-for":"192.0.2.1, 198.51.100.2"}}).then(r=>r.json());
 assert.equal((await request()).ip,"127.0.0.1");
 app.set("trust proxy",proxyPolicy("127.0.0.1/32"));
 assert.equal((await request()).ip,"198.51.100.2");
});
