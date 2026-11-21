"use strict";
/**
 * Unmounted Phase 2A owner HTTP adapter. Nothing listens on import.
 * A caller must explicitly mount it AND inject audited staging-only services.
 * No Codex dispatch, GitHub repository writes, reviewer signing or deployments.
 */
const {beginLogin,finishLogin,logout}=require("./phase2aOwnerSession");
const {authorizeUrl}=require("./phase2aGitHubOAuthExchange");
const {submitOwnerIntent}=require("./phase2aOwnerApprovalFacade");
const SHA256=/^[a-f0-9]{64}$/;
const failFlags=()=>({agentDispatchAuthorized:false,dispatched:false,
 mergeAuthorized:false,deployAuthorized:false,signingAuthorized:false,
 productionAuthorization:false});
function send(res,status,body,extra={}){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store","Pragma":"no-cache","X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY","Referrer-Policy":"no-referrer",
  "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'",
  ...extra});
 res.end(JSON.stringify({...body,...failFlags()}));
}
function ready(x){
 return x?.enabled===true&&x?.isolatedStaging===true&&
 x.sessionStore?.putPending&&x.sessionStore?.consumePending&&
 x.sessionStore?.putSession&&x.sessionStore?.getSession&&
 x.sessionStore?.revokeSession&&
 x.decisionClient?.query&&
 typeof x.exchangeCode==="function"&&
 typeof x.loadPendingPacket==="function"&&
 typeof x.loadFreshHandoff==="function"&&
 typeof x.fetchIdentity==="function"&&
 typeof x.clientId==="string"&&
 typeof x.callbackUrl==="string"&&typeof x.siteOrigin==="string"&&
 typeof x.serviceReadToken==="string"&&
 Number.isSafeInteger(x.ownerId)&&x.ownerId>0&&
 typeof x.ownerLogin==="string";
}
async function limitedJson(req,max=1024){
 const type=(req.headers?.["content-type"]||"").split(";")[0].trim().toLowerCase();
 if(type!=="application/json")throw Error("wrong_content_type");
 let text="";
 for await(const chunk of req){
  text+=chunk.toString("utf8");
  if(Buffer.byteLength(text)>max)throw Error("too_large");
 }
 const value=JSON.parse(text);
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("invalid_json");
 return value;
}
async function handleOwnerHttp(req,res,options={}){
 const url=req?.url;
 if(!ready(options)){
  send(res,404,{state:"disabled"});return true;
 }
 const route=typeof url==="string"?url.split("?")[0]:"";
 if(!["/phase2a/oauth/start","/phase2a/oauth/callback",
       "/phase2a/owner/decision","/phase2a/owner/logout"].includes(route))
  return false;
 // Per-instance rate limiting must be implemented by the mounting server.
 // Fail closed if it has no trusted rate limiter; no token in browser JSON.
 if(typeof options.checkRateLimit!=="function"||
    await Promise.resolve(options.checkRateLimit(req))!==true){
  send(res,429,{state:"blocked",reason:"rate_limited"});return true;
 }
 if(route==="/phase2a/oauth/start"){
  if(req.method!=="GET"||url!==route){
   send(res,405,{state:"blocked"});return true;
  }
  const start=await beginLogin({store:options.sessionStore});
  const redirect=authorizeUrl({clientId:options.clientId,
   callbackUrl:options.callbackUrl,siteOrigin:options.siteOrigin,
   state:start.state,codeChallenge:start.codeChallenge});
  if(!redirect||!start.setLoginCookie){
   send(res,503,{state:"blocked"});return true;
  }
  // No 302: a caller can show this URL after the server sets its binding cookie.
  // Strict CSP still forbids third-party subresources.
  send(res,200,{state:"login_started",authorizationUrl:redirect},
   {"Set-Cookie":start.setLoginCookie});return true;
 }
 if(route==="/phase2a/oauth/callback"){
  if(req.method!=="GET"||typeof url!=="string"||url.length>2048){
   send(res,400,{state:"blocked"});return true;
  }
  let query;
  try{
   const u=new URL(url,options.siteOrigin);
   if(u.pathname!==route||u.searchParams.getAll("code").length!==1||
      u.searchParams.getAll("state").length!==1||
      [...u.searchParams.keys()].some(k=>!["code","state"].includes(k)))
    throw Error("invalid_callback");
   query=u.searchParams;
  }catch{send(res,400,{state:"blocked"});return true;}
  const verified=await finishLogin({
   store:options.sessionStore,loginCookie:req.headers.cookie,
   code:query.get("code"),state:query.get("state"),
   exchangeCode:options.exchangeCode,
   serviceReadToken:options.serviceReadToken,
   expectedOwnerId:options.ownerId,expectedOwnerLogin:options.ownerLogin,
   fetchImpl:options.fetchIdentity
  });
  if(verified.verified!==true){
   send(res,401,{state:"blocked"},{ "Set-Cookie":
    "__Host-aca_login=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"});
   return true;
  }
  // Session/CSRF values only in TLS, no-store same-origin response, not URL.
  send(res,200,{state:"authenticated",csrfToken:verified.csrfToken,
   expiresAt:verified.expiresAt},
   {"Set-Cookie":[verified.clearLoginCookie,verified.setCookie]});
  return true;
 }
 if(route==="/phase2a/owner/logout"){
  if(req.method!=="POST"||url!==route){
   send(res,405,{state:"blocked"});return true;
  }
  // Logging out should not create an authenticated approval.
  const r=await logout({store:options.sessionStore,cookie:req.headers.cookie});
  send(res,200,{state:"signed_out"},{"Set-Cookie":r.clearCookie});return true;
 }
 if(req.method!=="POST"||url!==route){
  send(res,405,{state:"blocked"});return true;
 }
 let body;
 try{
  body=await limitedJson(req);
  if(Object.keys(body).sort().join(",")!=="decision,requestId"||
     !["approve","reject"].includes(body.decision)||!SHA256.test(body.requestId))
   throw Error("invalid_intent");
 }catch{send(res,400,{state:"blocked"});return true;}
 let packet;
 try{
  packet=await options.loadPendingPacket({requestId:body.requestId});
  if(!packet||packet.id!==body.requestId)throw Error("missing_packet");
 }catch{send(res,409,{state:"blocked"});return true;}
 const result=await submitOwnerIntent({
  sessionStore:options.sessionStore,decisionClient:options.decisionClient,
  cookie:req.headers.cookie,origin:req.headers.origin,
  expectedOrigin:options.siteOrigin,csrfHeader:req.headers["x-aca-csrf"],
  method:req.method,packet,decision:body.decision,
  repositoryId:options.repositoryId,loadFreshHandoff:options.loadFreshHandoff
 });
 send(res,result.state==="owner_intent_to_review"||
  result.state==="owner_rejected"?200:409,{
  state:result.state,reason:result.reason||null});
 return true;
}
module.exports={handleOwnerHttp};
