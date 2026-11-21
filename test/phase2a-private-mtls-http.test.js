"use strict";
// Real loopback TLS client authentication to the unmounted private HTTP adapter.
// Ephemeral OpenSSL certificates; no external endpoints or production credentials.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const https=require("node:https"),crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const {createIsolatedMtlsListener}=require("../src/automation/phase2aIsolatedMtlsListener");
const {createMtlsTransportVerifier}=require("../src/automation/phase2aMtlsTransport");
const {handlePrivateOwnerHttp}=require("../src/automation/phase2aPrivateOwnerHttp");
const {issueOwnerEdgeProof}=require("../src/automation/phase2aOwnerEdgeProof");
function generate(dir,name,ca=null){
 const key=path.join(dir,name+".key"),csr=path.join(dir,name+".csr"),
  cert=path.join(dir,name+".crt");
 const run=(...a)=>execFileSync("openssl",a,{cwd:dir,stdio:"pipe"});
 if(!ca)run("req","-x509","-newkey","rsa:2048","-nodes","-keyout",key,
  "-out",cert,"-days","1","-subj","/CN="+name);
 else{
  run("req","-newkey","rsa:2048","-nodes","-keyout",key,
   "-out",csr,"-subj","/CN="+name);
  run("x509","-req","-in",csr,"-CA",path.join(dir,ca+".crt"),
   "-CAkey",path.join(dir,ca+".key"),"-CAcreateserial","-out",cert,"-days","1");
 }
 return {key:fs.readFileSync(key,"utf8"),cert:fs.readFileSync(cert,"utf8")};
}
function send(port,{cert,key,ca,body,headers={},path:route="/phase2a/internal/owner-intent"}={}){
 return new Promise(resolve=>{
  const req=https.request({hostname:"127.0.0.1",servername:"localhost",port,
   method:"POST",path:route,cert,key,ca,rejectUnauthorized:true,
   headers:{"content-type":"application/json",...headers}},res=>{
    let response="";res.on("data",x=>response+=x);
    res.on("end",()=>resolve({status:res.statusCode,
     data:JSON.parse(response)}));
  });
  req.on("error",e=>resolve({error:e.code||e.message}));
  req.end(JSON.stringify(body||{}));
 });
}
test("real mTLS socket gates private signed owner intent; replay and spoofing fail closed",
 {timeout:30000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"aca-private-mtls-"));
 let server;
 try{
  const ca=generate(dir,"rootCA"),srv=generate(dir,"localhost","rootCA"),
   approved=generate(dir,"approved","rootCA"),wrong=generate(dir,"wrong","rootCA"),
   rogueCa=generate(dir,"rogueCA"),rogue=generate(dir,"rogue","rogueCA");
  const fingerprint=new crypto.X509Certificate(approved.cert).fingerprint256;
  const verifyTransport=createMtlsTransportVerifier({clientFingerprint256:fingerprint});
  const {privateKey,publicKey}=crypto.generateKeyPairSync("ed25519");
  const repo=1080201236,owner=230486228,requestId="a".repeat(64);
  const now=Date.now(),nonceSet=new Set();
  const dependencies={expectedIssuer:"aca-public-edge",
   expectedAudience:"aca-private-owner",repositoryId:repo,ownerId:owner,
   publicKey,now:now+200,nonceStore:{async claimOnce({nonce}){
    if(nonceSet.has(nonce))return false;nonceSet.add(nonce);return true;
   }},
   decisionClient:{async query(){return {rows:[]};}},
   loadPendingPacket:async()=>null,loadFreshHandoff:async()=>null};
  server=createIsolatedMtlsListener({serverKey:srv.key,serverCert:srv.cert,
   clientCa:ca.cert,clientFingerprint256:fingerprint,
   onAuthorizedRequest:(req,res)=>handlePrivateOwnerHttp(req,res,{
    verifyTransport,dependencies})});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  const proof=issueOwnerEdgeProof({issuer:"aca-public-edge",
   audience:"aca-private-owner",repositoryId:repo,ownerId:owner,requestId,
   decision:"approve",privateKey,now});
  assert.ok(proof);
  const body={decision:"approve",requestId,proof};
  const good=await send(port,{cert:approved.cert,key:approved.key,ca:ca.cert,body});
  assert.equal(good.status,409,JSON.stringify(good));
  assert.equal(good.data.reason,"missing_trusted_packet");
  assert.equal(nonceSet.size,1);
  const replay=await send(port,{cert:approved.cert,key:approved.key,ca:ca.cert,body});
  assert.equal(replay.status,409);
  assert.equal(replay.data.reason,"untrusted_owner_proof");
  const spoof=await send(port,{cert:wrong.cert,key:wrong.key,ca:ca.cert,body,
   headers:{"x-forwarded-client-cert":fingerprint,"x-forwarded-proto":"https"}});
  assert.equal(spoof.status,403,JSON.stringify(spoof));
  const absent=await send(port,{ca:ca.cert,body,
   headers:{"x-forwarded-client-cert":fingerprint}});
  assert.notEqual(absent.status,200);
  const rogueResult=await send(port,{cert:rogue.cert,key:rogue.key,ca:ca.cert,body});
  assert.notEqual(rogueResult.status,200);
  assert.equal(nonceSet.size,1);
  for(const result of [good,replay,spoof]){
   for(const k of ["agentDispatchAuthorized","dispatched","mergeAuthorized",
    "deployAuthorized","signingAuthorized","productionAuthorization"])
    assert.equal(result.data[k],false,k);
  }
 }finally{
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
