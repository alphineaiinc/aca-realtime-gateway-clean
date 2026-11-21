"use strict";
/**
 * An isolated, unmounted HTTPS/mTLS listener factory for Phase 2A.
 * No server is started on import or creation.
 * - TLS MUST authenticate the proxy client certificate (CA + fingerprint).
 * - Bind only to explicit loopback for local proof. Public exposure requires
 *   separately reviewed ingress/network policy and explicit authorization.
 * - No OAuth handler or correction action mounted by default.
 * - Never accept forwarding headers as transport evidence.
 */
const https=require("node:https");
const {createMtlsTransportVerifier}=require("./phase2aMtlsTransport");
const PEM=/-----BEGIN (?:CERTIFICATE|PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY)-----/;
function createIsolatedMtlsListener({serverKey,serverCert,clientCa,
 clientFingerprint256,onAuthorizedRequest,allowLoopbackOnly=true}={}){
 if(typeof serverKey!=="string"||!PEM.test(serverKey)||
    typeof serverCert!=="string"||!serverCert.includes("-----BEGIN CERTIFICATE-----")||
    typeof clientCa!=="string"||!clientCa.includes("-----BEGIN CERTIFICATE-----")||
    typeof onAuthorizedRequest!=="function"||allowLoopbackOnly!==true)
  throw Error("mtls_listener_not_configured");
 const verify=createMtlsTransportVerifier({clientFingerprint256});
 // Invalid pin must never silently create an accept-all listener.
 if(!/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(clientFingerprint256||""))
  throw Error("mtls_listener_not_configured");
 const server=https.createServer({key:serverKey,cert:serverCert,ca:[clientCa],
  requestCert:true,rejectUnauthorized:true,minVersion:"TLSv1.2",
  honorCipherOrder:true},(req,res)=>{
   if(!verify(req)){
    res.writeHead(403,{"Cache-Control":"no-store",
     "Content-Type":"application/json","Connection":"close"});
    res.end(JSON.stringify({state:"blocked",reason:"untrusted_transport",
     agentDispatchAuthorized:false,dispatched:false,mergeAuthorized:false,deployAuthorized:false,signingAuthorized:false,productionAuthorization:false}));
    return;
   }
   try{
    const result=onAuthorizedRequest(req,res);
    if(result&&typeof result.catch==="function")
     result.catch(()=>{if(!res.headersSent){res.writeHead(503,
      {"Cache-Control":"no-store"});res.end();}else res.destroy();});
   }catch{
    if(!res.headersSent){res.writeHead(503,{"Cache-Control":"no-store"});res.end();}
    else res.destroy();
   }
 });
 const originalListen=server.listen.bind(server);
 server.listen=(port=0,host="127.0.0.1",callback)=>{
  if(host!=="127.0.0.1"&&host!=="::1")
   throw Error("mtls_listener_non_loopback_forbidden");
  return originalListen(port,host,callback);
 };
 return server;
}
module.exports={createIsolatedMtlsListener};
