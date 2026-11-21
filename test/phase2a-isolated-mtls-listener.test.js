"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const https=require("node:https");
const crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const {createIsolatedMtlsListener}=
 require("../src/automation/phase2aIsolatedMtlsListener");
function generate(dir,name,caName=null){
 const key=path.join(dir,name+".key"),csr=path.join(dir,name+".csr"),
  cert=path.join(dir,name+".crt");
 const openssl=(...args)=>execFileSync("openssl",args,{cwd:dir,stdio:"pipe"});
 if(!caName){
  openssl("req","-x509","-newkey","rsa:2048","-nodes",
   "-keyout",key,"-out",cert,"-days","1",
   "-subj","/CN="+name);
 }else{
  openssl("req","-newkey","rsa:2048","-nodes",
   "-keyout",key,"-out",csr,"-subj","/CN="+name);
  openssl("x509","-req","-in",csr,"-CA",path.join(dir,caName+".crt"),
   "-CAkey",path.join(dir,caName+".key"),"-CAcreateserial",
   "-out",cert,"-days","1");
 }
 return {key:fs.readFileSync(key,"utf8"),cert:fs.readFileSync(cert,"utf8")};
}
function request(port,{cert,key,ca,headers={}}={}){
 return new Promise(resolve=>{
  const req=https.request({hostname:"127.0.0.1",port,path:"/proof",
   method:"GET",cert,key,ca,rejectUnauthorized:true,
   servername:"localhost",headers},res=>{
    let body="";res.on("data",x=>body+=x);
    res.on("end",()=>resolve({status:res.statusCode,body}));
   });
  req.on("error",e=>resolve({error:e.code||e.message}));
  req.end();
 });
}
test("real TLS: only client signed by pinned CA and matching fingerprint is accepted",
 {timeout:30000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"aca-mtls-"));
 let server;
 try{
  const ca=generate(dir,"rootCA"),serverCert=generate(dir,"localhost","rootCA"),
   client=generate(dir,"approved-proxy","rootCA"),
   other=generate(dir,"wrong-proxy","rootCA"),
   rogueCA=generate(dir,"rogueCA"),rogue=generate(dir,"rogue","rogueCA");
  const clientX509=new crypto.X509Certificate(client.cert);
  const fingerprint=clientX509.fingerprint256;
  let accepted=0;
  server=createIsolatedMtlsListener({
   serverKey:serverCert.key,serverCert:serverCert.cert,clientCa:ca.cert,
   clientFingerprint256:fingerprint,
   onAuthorizedRequest:(req,res)=>{accepted++;res.end("authenticated_proxy");}
  });
  assert.throws(()=>server.listen(0,"0.0.0.0"),/non_loopback_forbidden/);
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  const good=await request(port,{cert:client.cert,key:client.key,ca:ca.cert,
   headers:{"x-forwarded-proto":"http","x-forwarded-client-cert":"forged"}});
  assert.equal(good.status,200,JSON.stringify(good));
  assert.equal(good.body,"authenticated_proxy");
  const mismatched=await request(port,{cert:other.cert,key:other.key,ca:ca.cert,
   headers:{"x-forwarded-proto":"https"}});
  assert.equal(mismatched.status,403,JSON.stringify(mismatched));
  const noCert=await request(port,{ca:ca.cert,
   headers:{"x-forwarded-proto":"https","x-forwarded-host":"trusted"}});
  assert.notEqual(noCert.status,200);
  const untrusted=await request(port,{cert:rogue.cert,key:rogue.key,ca:ca.cert});
  assert.notEqual(untrusted.status,200);
  assert.equal(accepted,1);
 }finally{
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
test("configuration and non-loopback binding default to deny",()=>{
 assert.throws(()=>createIsolatedMtlsListener({}),/not_configured/);
 assert.throws(()=>createIsolatedMtlsListener({
  serverKey:"-----BEGIN PRIVATE KEY-----",serverCert:"-----BEGIN CERTIFICATE-----",
  clientCa:"-----BEGIN CERTIFICATE-----",clientFingerprint256:"invalid",
  onAuthorizedRequest:()=>{}
 }),/not_configured/);
});
