"use strict";
/**
 * Phase 2A trusted transport evidence: proxy-to-app mTLS only.
 *
 * This verifier must be attached ONLY to a dedicated HTTPS server configured
 * with requestCert:true and rejectUnauthorized:true, a trusted CA and a
 * separately pinned client certificate fingerprint. Do not use it behind a
 * plain HTTP TLS-terminating proxy (including Render's default ingress).
 *
 * Proxy forwarding headers / req.protocol / req.secure / Host are NOT proof.
 * Not mounted on any service by importing this file.
 */
const {timingSafeEqual}=require("node:crypto");
const FINGERPRINT=/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;
function sameHex(a,b){
 const x=Buffer.from(a.replaceAll(":",""),"hex");
 const y=Buffer.from(b.replaceAll(":",""),"hex");
 return x.length===32&&y.length===32&&timingSafeEqual(x,y);
}
function createMtlsTransportVerifier({clientFingerprint256}={}){
 if(typeof clientFingerprint256!=="string"||
    !FINGERPRINT.test(clientFingerprint256))
  return ()=>false;
 return function verifyTrustedTransport(req){
  try{
   const s=req?.socket;
   if(s?.encrypted!==true||s?.authorized!==true||
      typeof s.getPeerCertificate!=="function"||
      s.authorizationError!=null)return false;
   const cert=s.getPeerCertificate(true);
   // Cert's fingerprint MUST come from the TLS implementation,
   // not client HTTP headers or arbitrary request properties.
   if(!cert?.raw||!Buffer.isBuffer(cert.raw)||
      cert.raw.length===0||!FINGERPRINT.test(cert.fingerprint256||""))
    return false;
   return sameHex(cert.fingerprint256,clientFingerprint256);
  }catch{return false;}
 };
}
module.exports={createMtlsTransportVerifier};
