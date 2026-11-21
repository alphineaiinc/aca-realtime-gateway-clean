"use strict";
/**
 * Development-only backend session boundary for GitHub OAuth owner approval.
 * There are NO HTTP handlers or deployment wiring here.
 *
 * store: trusted, atomic, expiring storage implementing:
 *   putPending({digest, stateDigest, verifier, expiresAt, createdAt})
 *   consumePending(digest) => pending record ONCE, or null
 *   putSession({digest, ownerId, csrfDigest, expiresAt, createdAt}) => boolean
 *   getSession(digest) => session or null
 *   revokeSession(digest)
 * Store must be durable and shared across instances; in-memory is test-only.
 * Tokens are not returned by any validation method, never logged, and neither
 * a session nor an approval indicates Codex/merge/deploy authorization.
 */
const {randomBytes,createHash,timingSafeEqual}=require("node:crypto");
const {verifyGitHubOwner}=require("./phase2aOwnerIdentity");
const SESSION_TTL=15*60*1000,LOGIN_TTL=5*60*1000;
const COOKIE="__Host-aca_owner";
const valid=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{40,160}$/.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
const timestamp=x=>Number.isSafeInteger(x)&&x>=0;
const digest=x=>createHash("sha256").update(x).digest("hex");
const nonce=()=>randomBytes(32).toString("base64url");
const inert=()=>Object.freeze({agentDispatchAuthorized:false,
 mergeAuthorized:false,deployAuthorized:false,signingAuthorized:false,
 productionAuthorization:false});
const denied=reason=>Object.freeze({verified:false,reason,...inert()});
function equal(x,y){
 if(typeof x!=="string"||typeof y!=="string")return false;
 const a=Buffer.from(x),b=Buffer.from(y);
 return a.length===b.length&&timingSafeEqual(a,b);
}
function cookieHeader(sessionId){
 if(!valid(sessionId))return null;
 return COOKIE+"="+sessionId+"; Path=/; Secure; HttpOnly; SameSite=Strict";
}
function clearCookie(){
 return COOKIE+"=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0";
}
function parseCookie(value){
 if(typeof value!=="string"||value.length>4096)return null;
 const tokens=value.split(";").map(x=>x.trim());
 const matches=tokens.filter(x=>x.startsWith(COOKIE+"="));
 if(matches.length!==1)return null;
 const id=matches[0].slice(COOKIE.length+1);
 return valid(id)?id:null;
}
function originOk(origin,expected){
 if(typeof origin!=="string"||typeof expected!=="string")return false;
 try{
  const u=new URL(origin),v=new URL(expected);
  return u.protocol==="https:"&&v.protocol==="https:"&&
   u.origin===v.origin&&u.username===""&&u.password===""&&
   v.username===""&&v.password===""&&u.pathname==="/"&&
   u.search===""&&u.hash===""&&v.pathname==="/"&&
   v.search===""&&v.hash==="";
 }catch{return false;}
}
/**
 * Caller must separately provision a GitHub OAuth App client, registered exact
 * callback, PKCE S256 and secure exchange. This module only holds the
 * one-time state/PKCE verifier; it does NOT construct authorize URLs or routes.
 */
async function beginLogin({store,now=Date.now()}={}){
 if(!store?.putPending||!timestamp(now))return denied("unavailable");
 const loginId=nonce(),state=nonce(),verifier=nonce();
 const record={digest:digest(loginId),stateDigest:digest(state),verifier,
  createdAt:now,expiresAt:now+LOGIN_TTL};
 try{
  if(await store.putPending(record)!==true)return denied("unavailable");
  return Object.freeze({verified:false,loginId,state,
   codeChallenge:createHash("sha256").update(verifier).digest("base64url"),
   challengeMethod:"S256",expiresAt:record.expiresAt,...inert()});
 }catch{return denied("unavailable");}
}
/**
 * Never trust callback params as identity. The caller's exchangeCode must
 * perform an authenticated server-side GitHub token exchange with an exact
 * pre-registered redirect URI and the supplied PKCE verifier.
 */
async function finishLogin({store,loginId,state,code,exchangeCode,
 serviceReadToken,expectedOwnerId,expectedOwnerLogin,
 now=Date.now(),fetchImpl}={}){
 if(!store?.consumePending||!store?.putSession||!valid(loginId)||
    !valid(state)||typeof code!=="string"||code.length<8||
    code.length>1024||typeof exchangeCode!=="function"||
    !positive(expectedOwnerId)||!timestamp(now))
  return denied("invalid_callback");
 let pending;
 try{pending=await store.consumePending(digest(loginId));}
 catch{return denied("unavailable");}
 // The state is consumed even if mismatched to prevent replay/probing.
 if(!pending||pending.digest!==digest(loginId)||
    !timestamp(pending.createdAt)||!timestamp(pending.expiresAt)||
    now<pending.createdAt||now>=pending.expiresAt||
    pending.expiresAt-pending.createdAt>LOGIN_TTL||
    !equal(pending.stateDigest,digest(state))||
    !valid(pending.verifier))return denied("invalid_or_expired_state");
 try{
  const oauthToken=await exchangeCode({code,codeVerifier:pending.verifier});
  const identity=await verifyGitHubOwner({userOAuthToken:oauthToken,
   serviceReadToken,expectedOwnerId,expectedOwnerLogin,fetchImpl});
  if(!identity.verified)return denied("owner_identity_unverified");
  const sessionId=nonce(),csrfToken=nonce();
  const stored=await store.putSession({digest:digest(sessionId),
   ownerId:identity.ownerId,csrfDigest:digest(csrfToken),
   createdAt:now,expiresAt:now+SESSION_TTL});
  if(stored!==true)return denied("unavailable");
  // CSRF token must be inserted into an HTTPS form or returned to an
  // authenticated same-origin browser view; NEVER in a URL or log.
  return Object.freeze({verified:true,ownerId:identity.ownerId,
   setCookie:cookieHeader(sessionId),csrfToken,
   expiresAt:now+SESSION_TTL,...inert()});
 }catch{return denied("identity_or_session_unavailable");}
}
/**
 * Origin and independent CSRF header are required in addition to the
 * HttpOnly cookie. Only validated server-side session owner ID is returned.
 * Caller MUST reverify current GitHub/ledger handoff before writing intent.
 */
async function validateOwnerAction({store,cookie,origin,expectedOrigin,
 csrfHeader,method,now=Date.now()}={}){
 if(method!=="POST"||!originOk(origin,expectedOrigin)||
    !valid(csrfHeader)||!timestamp(now)||!store?.getSession)
  return denied("invalid_session_request");
 const sessionId=parseCookie(cookie);
 if(!sessionId)return denied("missing_session");
 try{
  const s=await store.getSession(digest(sessionId));
  if(!s||!positive(s.ownerId)||!timestamp(s.createdAt)||
     !timestamp(s.expiresAt)||now<s.createdAt||
     now>=s.expiresAt||s.expiresAt-s.createdAt>SESSION_TTL||
     !equal(s.csrfDigest,digest(csrfHeader)))
    return denied("invalid_or_expired_session");
  return Object.freeze({verified:true,ownerId:s.ownerId,...inert()});
 }catch{return denied("unavailable");}
}
async function logout({store,cookie}={}){
 const sessionId=parseCookie(cookie);
 if(sessionId&&store?.revokeSession){
  try{await store.revokeSession(digest(sessionId));}catch{/* fail closed */}
 }
 return Object.freeze({clearCookie:clearCookie(),...inert()});
}
module.exports={beginLogin,finishLogin,validateOwnerAction,logout,
 cookieHeader,parseCookie,originOk,COOKIE,SESSION_TTL,LOGIN_TTL};
