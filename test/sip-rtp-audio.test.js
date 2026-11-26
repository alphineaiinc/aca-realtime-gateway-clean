"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {decodePcmu,encodePcmu}=require("../src/voice/sipRtpAudio");
test("PCMU audio round trip preserves bytes and RTP identity",()=>{
 const frame={sequence:65535,timestamp:4294967295,ssrc:123,audio:Buffer.alloc(160,255)};
 const packet=encodePcmu(frame);assert.equal(packet.length,172);assert.deepEqual(decodePcmu(packet),frame);
 for(const mutate of [p=>{p[0]=0},p=>{p[1]=8},p=>{p[0]=159},p=>{p[0]=160;p[p.length-1]=255}]){
  const bad=Buffer.from(packet);mutate(bad);assert.equal(decodePcmu(bad),null);
 }
 assert.equal(decodePcmu(Buffer.alloc(12)),null);
 assert.throws(()=>encodePcmu({...frame,sequence:65536}),/INVALID_RTP_FRAME/);
});
