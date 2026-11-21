"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {EventEmitter}=require("node:events");
const {createGithubReadTransport:create}=require("../src/automation/phase2GithubReadTransport");
function mockHttps({status=200,body='{"ok":true}',location,timeout=false}={}){
 const captured=[];
 return {captured,request(url,options,callback){
  const req=new EventEmitter();req.destroy=()=>{};req.end=()=>{
   captured.push({url,options});
   if(timeout){process.nextTick(()=>req.emit("timeout"));return;}
   const res=new EventEmitter();res.statusCode=status;res.headers=location?{location}:{};res.resume=()=>{};
   process.nextTick(()=>{callback(res);res.emit("data",Buffer.from(body));res.emit("end");});
  };return req;
 }};
}
const URL="https://api.github.com/repos/alphineaiinc/aca-realtime-gateway-clean/pulls/91";
const opts={method:"GET",redirect:"manual"};
test("authenticated HTTPS GET, pinned hostname and bounded JSON",async()=>{
 const h=mockHttps();const transport=create({token:"fixture-secret",httpsModule:h});
 const r=await transport(URL,opts);assert.deepEqual(r.data,{ok:true});
 assert.equal(h.captured.length,1);assert.equal(h.captured[0].options.method,"GET");
 assert.equal(h.captured[0].options.headers.Authorization,"Bearer fixture-secret");
 assert.equal(h.captured[0].url.hostname,"api.github.com");
});
test("rejects SSRF, credentials in URL, non-GET and redirects",async()=>{
 const transport=create({token:"fixture",httpsModule:mockHttps()});
 for(const url of ["http://api.github.com/repos/x/y","https://evil.example/repos/x/y","https://user:pass@api.github.com/repos/x/y","https://api.github.com:444/repos/x/y","https://api.github.com/other"]){
 await assert.rejects(transport(url,opts));
 }
 await assert.rejects(transport(URL,{method:"POST",redirect:"manual"}));
 await assert.rejects(transport(URL,{method:"GET",redirect:"follow"}));
 await assert.rejects(create({token:"fixture",httpsModule:mockHttps({status:302,location:"https://evil.example"})})(URL,opts));
});
test("rejects oversized payload, invalid JSON and timeout",async()=>{
 await assert.rejects(create({token:"fixture",httpsModule:mockHttps({body:'{"x":"'+("a".repeat(2000))+'"}'}),maxBytes:1024})(URL,opts));
 await assert.rejects(create({token:"fixture",httpsModule:mockHttps({body:"invalid"})})(URL,opts));
 await assert.rejects(create({token:"fixture",httpsModule:mockHttps({timeout:true})})(URL,opts));
});
test("rejects missing, newline or invalid transport secrets",()=>{
 for(const token of ["","\n","bad\rkey"])assert.throws(()=>create({token}));
 assert.throws(()=>create({token:"fixture",timeoutMs:99999}));
});
