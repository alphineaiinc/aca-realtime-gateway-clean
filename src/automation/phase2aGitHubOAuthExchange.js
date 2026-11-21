"use strict";
/**
 * Unwired GitHub OAuth App authorization + token exchange.
 * Static, exact staging callback configured by trusted server; never taken
 * from the browser. Do not use the installation or reviewer-signing token.
 * No routes, persistent credentials or network calls on module import.
 */
const valid=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{12,160}$/.test(x);
const pkce=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{43,128}$/.test(x);
function trustedCallback(url,origin){
 try{
  const u=new URL(url),o=new URL(origin);
  return u.protocol==="https:"&&o.protocol==="https:"&&
   u.origin===o.origin&&o.pathname==="/"&&o.search===""&&o.hash===""&&
   u.pathname==="/phase2a/oauth/callback"&&u.search===""&&u.hash===""&&
   !u.username&&!u.password&&!o.username&&!o.password;
 }catch{return false;}
}
function authorizeUrl({clientId,callbackUrl,siteOrigin,state,codeChallenge}={}){
 if(!valid(clientId)||!pkce(state)||!pkce(codeChallenge)||
    !trustedCallback(callbackUrl,siteOrigin))return null;
 const u=new URL("https://github.com/login/oauth/authorize");
 u.searchParams.set("client_id",clientId);
 u.searchParams.set("redirect_uri",callbackUrl);
 u.searchParams.set("state",state);
 u.searchParams.set("code_challenge",codeChallenge);
 u.searchParams.set("code_challenge_method","S256");
 u.searchParams.set("allow_signup","false");
 return u.toString();
}
function makeCodeExchange({clientId,clientSecret,callbackUrl,siteOrigin,fetchImpl=fetch}={}){
 if(!valid(clientId)||typeof clientSecret!=="string"||clientSecret.length<24||
    !trustedCallback(callbackUrl,siteOrigin)||typeof fetchImpl!=="function")
  throw Error("oauth_exchange_not_configured");
 return async function exchangeCode({code,codeVerifier}={}){
  if(typeof code!=="string"||code.length<8||code.length>1024||
     !pkce(codeVerifier))throw Error("oauth_invalid_code");
  // Exact GitHub HTTPS endpoint, no redirects, no browser-provided URL.
  const form=new URLSearchParams({client_id:clientId,client_secret:clientSecret,
   code,redirect_uri:callbackUrl,code_verifier:codeVerifier});
  const response=await fetchImpl("https://github.com/login/oauth/access_token",{
   method:"POST",redirect:"error",signal:AbortSignal.timeout(7000),
   headers:{Accept:"application/json",
    "Content-Type":"application/x-www-form-urlencoded",
    "Cache-Control":"no-store"},
   body:form.toString()
  });
  if(!response?.ok)throw Error("oauth_exchange_failed");
  const raw=await response.text();
  if(typeof raw!=="string"||raw.length>4096)throw Error("oauth_exchange_failed");
  let data;
  try{data=JSON.parse(raw);}catch{throw Error("oauth_exchange_failed");}
  if(data?.error||data?.token_type?.toLowerCase()!=="bearer"||
     typeof data?.access_token!=="string"||data.access_token.length<24)
   throw Error("oauth_exchange_failed");
  // Returned only to the server-side identity verifier.
  return data.access_token;
 };
}
module.exports={trustedCallback,authorizeUrl,makeCodeExchange};
