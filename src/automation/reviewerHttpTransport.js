"use strict";
/**
 * Authenticated transport for the isolated reviewer endpoint.
 * Secret and exact endpoint originate from the trusted staging operator,
 * never PR contents. A successful HTTPS response is NOT a trusted verdict:
 * callers must additionally verify its Ed25519 signature.
 */
function createReviewerHttpTransport({token,fetchImpl=fetch,timeoutMs=7000,maxBytes=8192}={}){
 if(typeof token!=="string"||token.length<32||typeof fetchImpl!=="function"||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>15000||
    !Number.isSafeInteger(maxBytes)||maxBytes<512||maxBytes>65536)
   throw new Error("invalid_reviewer_transport_configuration");
 return async function reviewerHttpTransport(endpoint,scope){
   const response=await fetchImpl(endpoint,{
     method:"POST",redirect:"error",
     headers:{"Content-Type":"application/json","Accept":"application/json",
       "Authorization":"Bearer "+token},
     body:JSON.stringify(scope),
     signal:AbortSignal.timeout(timeoutMs)
   });
   if(!response||response.status!==200||!response.ok||
      typeof response.arrayBuffer!=="function")
     throw new Error("reviewer_http_unavailable");
   const contentType=response.headers?.get?.("content-type")||"";
   const length=Number(response.headers?.get?.("content-length"));
   if(!/^application\/json(?:\s*;|\s*$)/i.test(contentType)||
      (Number.isFinite(length)&&length>maxBytes))
     throw new Error("invalid_reviewer_http_response");
   // Bound streamed response consumption even if Content-Length is absent.
   if(!response.body?.getReader)throw new Error("invalid_reviewer_http_response");
   const reader=response.body.getReader();
   let size=0;const chunks=[];
   try{
     for(;;){
       const {value,done}=await reader.read();
       if(done)break;
       if(!(value instanceof Uint8Array))throw new Error("invalid_reviewer_http_response");
       size+=value.byteLength;
       if(size>maxBytes)throw new Error("reviewer_http_response_too_large");
       chunks.push(Buffer.from(value));
     }
   }catch(error){await reader.cancel().catch(()=>{});throw error;}
   let parsed;
   try{parsed=JSON.parse(Buffer.concat(chunks).toString("utf8"));}
   catch{throw new Error("invalid_reviewer_http_json");}
   if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
     throw new Error("invalid_reviewer_http_json");
   return parsed;
 };
}
module.exports={createReviewerHttpTransport};
