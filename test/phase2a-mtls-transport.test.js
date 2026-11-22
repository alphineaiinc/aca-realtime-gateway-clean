"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createMtlsTransportVerifier}=require("../src/automation/phase2aMtlsTransport");
const FP="AB:".repeat(31)+"AB";
function request({encrypted=true,authorized=true,authorizationError=null,
 fingerprint256=FP,raw=Buffer.from("fake-der-certificate"),
 headers={}}={}){
 return {headers:{host:"staging.example.test",
  "x-forwarded-proto":"https","x-forwarded-host":"staging.example.test",...headers},
  secure:true,protocol:"https",
  socket:{encrypted,authorized,authorizationError,
   getPeerCertificate:()=>({fingerprint256,raw})}};
}
test("accept only authenticated proxy mTLS certificate matching pinned fingerprint",()=>{
 const verify=createMtlsTransportVerifier({clientFingerprint256:FP});
 assert.equal(verify(request()),true);
});
test("fail closed on HTTP/plaintext, proxy header spoof, TLS error and unauthorized client",()=>{
 const verify=createMtlsTransportVerifier({clientFingerprint256:FP});
 for(const req of [
  request({encrypted:false}),request({authorized:false}),
  request({authorizationError:"CERT_HAS_EXPIRED"}),
  request({fingerprint256:"CD:".repeat(31)+"CD"}),
  request({raw:null}),
  {headers:{"x-forwarded-proto":"https","x-forwarded-client-cert":FP},
   secure:true,protocol:"https",socket:{encrypted:false}},
  {socket:{encrypted:true,authorized:true,
   getPeerCertificate:()=>{throw Error("no cert");}}},
  {socket:{encrypted:true,authorized:true}},
  null
 ])assert.equal(verify(req),false);
});
test("misconfigured fingerprint is denied, never falls back to forwarded values",()=>{
 for(const fingerprint of [null,"",FP.toLowerCase(),"AB","ff".repeat(32)]){
  const verify=createMtlsTransportVerifier({clientFingerprint256:fingerprint});
  assert.equal(verify(request()),false);
 }
});
