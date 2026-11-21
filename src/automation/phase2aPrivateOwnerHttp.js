"use strict";
/**
 * Unmounted private mTLS request adapter. Mount ONLY inside the authenticated
 * callback of createIsolatedMtlsListener. Never accepts proxy headers as proof.
 * This adapter does not create listeners, credentials, SQL pools, or actions.
 */
const {handlePrivateOwnerIntent}=require("./phase2aPrivateOwnerIntent");
const PATH="/phase2a/internal/owner-intent";
const inactive=()=>({agentDispatchAuthorized:false,dispatched:false,
 mergeAuthorized:false,deployAuthorized:false,signingAuthorized:false,
 productionAuthorization:false});
function respond(res,status,state,reason){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify({state,...(reason?{reason}:{}),...inactive()}));
}
async function handlePrivateOwnerHttp(req,res,{verifyTransport,dependencies}={}){
 if(req?.url!==PATH||req?.method!=="POST"){
  respond(res,404,"blocked","unknown_route");return;
 }
 if(typeof verifyTransport!=="function"||verifyTransport(req)!==true){
  respond(res,403,"blocked","untrusted_transport");return;
 }
 if((req.headers?.["content-type"]||"").split(";")[0].trim().toLowerCase()!=="application/json"){
  respond(res,415,"blocked","wrong_content_type");return;
 }
 let raw="",body;
 try{
  for await(const chunk of req){
   raw+=chunk.toString("utf8");
   if(Buffer.byteLength(raw)>4096)throw Error("body_too_large");
  }
  body=JSON.parse(raw);
  if(!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).sort().join(",")!=="decision,proof,requestId")
   throw Error("invalid_body");
 }catch{respond(res,400,"blocked","invalid_body");return;}
 try{
  const result=await handlePrivateOwnerIntent({...dependencies,body});
  const success=["owner_intent_to_review","owner_rejected"].includes(result.state);
  respond(res,success?200:409,result.state,result.reason);
 }catch{respond(res,503,"blocked","private_dependency_unavailable");}
}
module.exports={handlePrivateOwnerHttp};
