"use strict";
/**
 * Unwired Render private-network mTLS client, for a future dedicated edge.
 * Uses fixed private service DNS, certificate validation, and explicit client
 * certificate. Never sends browser cookies, OAuth tokens or forwarding headers.
 * HTTPS request body is restricted to signed owner-proof advisory data.
 * The private service MUST independently verify signature, audience, owner,
 * nonce replay, and current CI evidence before writing any owner intent.
 * No side effects on import, no request or server starts automatically.
 */
const https=require("node:https");
const {X509Certificate,timingSafeEqual}=require("node:crypto");
const FP=/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;
const PRIVATE=/^[a-z0-9][a-z0-9-]{1,62}(?:\.render-internal\.com)?$/;
const PATHS=new Set(["/phase2a/internal/owner-intent"]);
const legacyFields="audience,decision,expiresAt,issuedAt,issuer,nonce,ownerId,repositoryId,requestId,signature,version";
const rotatedFields="audience,decision,expiresAt,issuedAt,issuer,keyId,nonce,ownerId,repositoryId,requestId,signature,version";
function wellFormedProof(p,body){
 return p&&typeof p==="object"&&!Array.isArray(p)&&
  ((p.version==="aca-owner-edge-proof-v1"&&Object.keys(p).sort().join(",")===legacyFields)||
   (p.version==="aca-owner-edge-proof-v2"&&Object.keys(p).sort().join(",")===rotatedFields&&
    /^[a-z][a-z0-9-]{2,63}$/.test(p.keyId||"")))&&p.requestId===body.requestId&&
  p.decision===body.decision&&Number.isSafeInteger(p.repositoryId)&&
  p.repositoryId>0&&Number.isSafeInteger(p.ownerId)&&p.ownerId>0&&
  typeof p.issuer==="string"&&typeof p.audience==="string"&&
  Number.isSafeInteger(p.issuedAt)&&Number.isSafeInteger(p.expiresAt)&&
  p.expiresAt>p.issuedAt&&p.expiresAt-p.issuedAt<=60000&&
  /^[A-Za-z0-9_-]{43}$/.test(p.nonce||"")&&
  /^[A-Za-z0-9_-]{86}$/.test(p.signature||"");
}
function equalHex(a,b){
 if(!FP.test(a||"")||!FP.test(b||""))return false;
 const x=Buffer.from(a.replaceAll(":",""),"hex");
 const y=Buffer.from(b.replaceAll(":",""),"hex");
 return timingSafeEqual(x,y);
}
function createPrivateMtlsClient({hostname,port=8443,
 serverCa,clientCert,clientKey,serverFingerprint256,
 requestImpl=https.request}={}){
 if(typeof hostname!=="string"||!PRIVATE.test(hostname)||
    !Number.isSafeInteger(port)||port<1||port>65535||
    typeof serverCa!=="string"||!serverCa.includes("-----BEGIN CERTIFICATE-----")||
    typeof clientCert!=="string"||!clientCert.includes("-----BEGIN CERTIFICATE-----")||
    typeof clientKey!=="string"||!clientKey.includes("-----BEGIN ")||
    !FP.test(serverFingerprint256||"")||typeof requestImpl!=="function")
  throw Error("private_mtls_client_not_configured");
 const expectedHost=hostname;
 return Object.freeze({
  async sendAdvisory({path="/phase2a/internal/owner-intent",body}={}){
   if(!PATHS.has(path)||!body||typeof body!=="object"||
      Array.isArray(body)||Object.keys(body).sort().join(",")!=="decision,proof,requestId"||
      !["approve","reject"].includes(body.decision)||
      !/^[a-f0-9]{64}$/.test(body.requestId||"")||
      !wellFormedProof(body.proof,body))
    throw Error("invalid_private_request");
   const payload=JSON.stringify(body);
   return new Promise((resolve,reject)=>{
    const req=requestImpl({
     hostname:expectedHost,port,method:"POST",path,
     cert:clientCert,key:clientKey,ca:serverCa,
     rejectUnauthorized:true,servername:expectedHost,
     minVersion:"TLSv1.2",timeout:5000,
     headers:{"Content-Type":"application/json",
      "Content-Length":Buffer.byteLength(payload),
      "Accept":"application/json"},
     checkServerIdentity:(name,cert)=>{
      const tls=require("node:tls");
      const err=tls.checkServerIdentity(name,cert);
      if(err)return err;
      if(!cert?.raw||!Buffer.isBuffer(cert.raw))
       return Error("mtls_server_identity_missing");
      const fp=new X509Certificate(cert.raw).fingerprint256;
      if(!equalHex(fp,serverFingerprint256))
       return Error("mtls_server_fingerprint_mismatch");
     }
    },res=>{
     let response="";
     res.on("data",chunk=>{
      response+=chunk.toString("utf8");
      if(Buffer.byteLength(response)>4096)req.destroy(Error("mtls_response_too_large"));
     });
     res.on("end",()=>{
      if(res.statusCode!==200)return reject(Error("private_request_blocked"));
      try{
       const json=JSON.parse(response);
       if(!["owner_intent_to_review","owner_rejected"].includes(json.state)||
          json.agentDispatchAuthorized!==false||json.dispatched!==false||
          json.mergeAuthorized!==false||json.deployAuthorized!==false||
          json.signingAuthorized!==false||json.productionAuthorization!==false)
        throw Error("untrusted_private_response");
       resolve(Object.freeze({state:json.state,
        agentDispatchAuthorized:false,dispatched:false,mergeAuthorized:false,
        deployAuthorized:false,signingAuthorized:false,productionAuthorization:false}));
      }catch{reject(Error("untrusted_private_response"));}
     });
    });
    req.on("timeout",()=>req.destroy(Error("mtls_private_timeout")));
    req.on("error",()=>reject(Error("mtls_private_unavailable")));
    req.end(payload);
   });
  }
 });
}
module.exports={createPrivateMtlsClient};
