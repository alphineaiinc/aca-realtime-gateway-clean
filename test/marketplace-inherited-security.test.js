"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {elevenLabsRequest}=require("../src/security/elevenLabsRequest");
const axios=require("axios");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
test("ElevenLabs request destination is fixed and redirects disabled",async()=>{
 for(const format of ["ulaw_8000","mp3_44100_128"]){
  const {url,options}=elevenLabsRequest("Voice123",format);
  const uri=new URL(axios.getUri({...options,url}));
  assert.equal(uri.origin,"https://api.elevenlabs.io");
  assert.equal(uri.pathname,"/v1/text-to-speech/Voice123");
  assert.equal(uri.searchParams.get("output_format"),format);
  assert.equal(options.maxRedirects,0);
  assert.equal(options.allowAbsoluteUrls,false);
 }
 for(const value of ["../other","https://other.invalid","//other.invalid","a?b","a%2fb","a\r\nb","a\\b","",null])assert.throws(()=>elevenLabsRequest(value,"ulaw_8000"));
 assert.throws(()=>elevenLabsRequest("Voice123","mp3&other=1"));
});
test("reported operational diagnostic sinks do not emit supplied request values",async()=>{
 const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
 const cases=[["socket_handler.js",["WS_BUSINESS_CONTEXT_ATTACHED"]],["src/routes/chat_stream.js",["CHAT_STREAM_SESSION_CLEARED","CHAT_STREAM_STARTED","CHAT_STREAM_CLIENT_CLOSED","CHAT_STREAM_COMPLETED","CHAT_STREAM_FAILED"]],["src/routes/brain.js",["BRAIN_ADAPTIVE_RESPONSE_COMPLETED"]]];
 for(const [file,events] of cases){
  const source=read(file);
  for(const event of events){
   const statement=source.split("\n").find(line=>line.includes('console.log("'+event+'"'));
   assert.ok(statement,event);
   const captured=[];
   vm.runInNewContext(statement.trim(),{console:{log:(...args)=>captured.push(args)},tenant_id:"injected\nrecord",sid:"injected",session_id:"injected",ws:{business_id:"injected"}});
   assert.deepEqual(captured,[[event]]);
  }
 }
 const brain=read("src/routes/brain.js");
 assert.doesNotMatch(brain,/appendFile|response_tuning\.log/);
 const adaptive=brain.match(/async function logAdaptiveResponse\(\) \{[^}]+\}/);
 assert.ok(adaptive);
 const events=[];
 await vm.runInNewContext(adaptive[0]+"\nlogAdaptiveResponse('private query','private response',0.5,1,'malicious')",{console:{log:(...args)=>events.push(args)}});
 assert.deepEqual(events,[["BRAIN_ADAPTIVE_RESPONSE_COMPLETED"]]);
});
