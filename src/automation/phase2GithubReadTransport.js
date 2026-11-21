"use strict";
/**
 * HTTPS-only GitHub REST transport, no redirects, bounded bytes/time.
 * Token is supplied by a trusted secret manager; never by PR/event data.
 * No action or write methods supported. Node's HTTPS validates TLS peers.
 */
const https=require("node:https");
function createGithubReadTransport({token,httpsModule=https,timeoutMs=5000,maxBytes=1048576}={}){
 if(typeof token!=="string"||!token.trim()||token.includes("\r")||token.includes("\n")||
 !Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000||
 !Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>4194304||
 typeof httpsModule?.request!=="function")throw Error("invalid_github_transport_configuration");
 return async function request(url,options={}){
  const parsed=new URL(url);
  if(parsed.protocol!=="https:"||parsed.hostname!=="api.github.com"||
   parsed.port||parsed.username||parsed.password||parsed.hash||
   !parsed.pathname.startsWith("/repos/")||
   options.method!=="GET"||options.redirect!=="manual")
   throw Error("github_transport_target_rejected");
  return new Promise((resolve,reject)=>{
   let finished=false,req;
   const fail=e=>{if(!finished){finished=true;reject(e instanceof Error?e:Error("github_transport_error"));}};
   try{
    req=httpsModule.request(parsed,{method:"GET",timeout:timeoutMs,
     headers:{Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      Authorization:`Bearer ${token}`,"User-Agent":"alphine-phase2-readonly-provenance"}},res=>{
     if(finished)return;
     const status=res.statusCode;
     if(status!==200||res.headers?.location){res.resume?.();fail(Error("github_http_status_rejected"));return;}
     let size=0;const chunks=[];
     res.on("data",chunk=>{
      if(finished)return;
      size+=chunk.length;
      if(size>maxBytes){fail(Error("github_response_too_large"));req.destroy?.();return;}
      chunks.push(chunk);
     });
     res.on("error",fail);
     res.on("end",()=>{
      if(finished)return;
      try{
       const data=JSON.parse(Buffer.concat(chunks).toString("utf8"));
       if(!data||typeof data!=="object"||Array.isArray(data))throw Error("invalid_github_json");
       finished=true;resolve({status:200,redirected:false,data});
      }catch(e){fail(e);}
     });
    });
    req.on("error",fail);
    req.on("timeout",()=>{fail(Error("github_request_timeout"));req.destroy?.();});
    req.end();
   }catch(e){fail(e);}
  });
 };
}
module.exports={createGithubReadTransport};
