"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {beginLogin,finishLogin,validateOwnerAction,logout,parseCookie,
 COOKIE}=require("../src/automation/phase2aOwnerSession");
const OWNER=230486228,READ="separate-read-only-service-token-1234567890",
 ACCESS="actual-github-oauth-user-token-1234567890",NOW=1700000000000;
function store(){
 const p=new Map(),s=new Map();
 return {pending:p,sessions:s,
  async putPending(r){p.set(r.digest,r);return true;},
  async consumePending(d){const r=p.get(d);p.delete(d);return r||null;},
  async putSession(r){s.set(r.digest,r);return true;},
  async getSession(d){return s.get(d)||null;},
  async revokeSession(d){s.delete(d);}
 };
}
const github=async(_url)=>({ok:true,json:async()=>({
 id:OWNER,login:"alphineaiinc"})});
async function loggedIn(){
 const db=store(),start=await beginLogin({store:db,now:NOW});
 const exchange=[];
 const result=await finishLogin({store:db,loginCookie:start.setLoginCookie.split(';')[0],
  state:start.state,code:"one-time-oauth-code",exchangeCode:async p=>{
   exchange.push(p);return ACCESS;
  },serviceReadToken:READ,expectedOwnerId:OWNER,
  expectedOwnerLogin:"alphineaiinc",now:NOW+100,fetchImpl:github});
 return {db,start,result,exchange};
}
function guard(x){for(const k of ["agentDispatchAuthorized","dispatched","mergeAuthorized",
 "deployAuthorized","signingAuthorized","productionAuthorization"])
  assert.equal(x[k],false,k);}
test("OAuth start stores one-time state and PKCE verifier only in server store",async()=>{
 const db=store();const r=await beginLogin({store:db,now:NOW});
 assert.equal(r.verified,false);guard(r);
 assert.match(r.state,/^[\w-]{43}$/);
 assert.match(r.codeChallenge,/^[\w-]{43}$/);
 assert.equal(r.challengeMethod,"S256");
 assert.equal(db.pending.size,1);
 assert.match(r.setLoginCookie,/^__Host-aca_login=/);
 assert.match(r.setLoginCookie,/; Secure; HttpOnly; SameSite=Lax/);
 assert.equal(JSON.stringify(r).includes("verifier"),false);
});
test("validated GitHub owner creates rotated secure HttpOnly session and CSRF",async()=>{
 const x=await loggedIn();assert.equal(x.result.verified,true);guard(x.result);
 assert.equal(x.db.pending.size,0);
 assert.match(x.result.clearLoginCookie,/Max-Age=0/);assert.equal(x.db.sessions.size,1);
 assert.equal(x.exchange.length,1);
 assert.match(x.result.setCookie,/^__Host-aca_owner=/);
 assert.match(x.result.setCookie,/; Secure; HttpOnly; SameSite=Strict/);
 assert.equal(x.result.setCookie.includes(x.result.csrfToken),false);
 const v=await validateOwnerAction({store:x.db,cookie:x.result.setCookie.split(";")[0],
  origin:"https://staging.example.test",expectedOrigin:"https://staging.example.test",
  csrfHeader:x.result.csrfToken,method:"POST",now:NOW+200});
 assert.equal(v.verified,true);assert.equal(v.ownerId,OWNER);guard(v);
});
test("mismatched state consumes pending request and rejects callback replay",async()=>{
 const db=store(),r=await beginLogin({store:db,now:NOW});
 let calls=0;
 const f=args=>finishLogin({store:db,loginCookie:r.setLoginCookie.split(';')[0],state:r.state,
  code:"one-time-code",exchangeCode:async()=>{calls++;return ACCESS;},
  serviceReadToken:READ,expectedOwnerId:OWNER,expectedOwnerLogin:"alphineaiinc",
  fetchImpl:github,now:NOW+100,...args});
 const bad=await f({state:"x".repeat(43)});
 assert.equal(bad.verified,false);assert.equal(calls,0);
 const replay=await f({});
 assert.equal(replay.verified,false);assert.equal(calls,0);
 const again=await f({});
 assert.equal(again.verified,false);guard(replay);
});
test("expired login and mismatched GitHub identity do not create sessions",async()=>{
 const db=store(),r=await beginLogin({store:db,now:NOW});
 const expired=await finishLogin({store:db,loginCookie:r.setLoginCookie.split(';')[0],state:r.state,
  code:"one-time-code",exchangeCode:async()=>ACCESS,serviceReadToken:READ,
  expectedOwnerId:OWNER,expectedOwnerLogin:"alphineaiinc",
  now:r.expiresAt,fetchImpl:github});
 assert.equal(expired.verified,false);assert.equal(db.sessions.size,0);
 const q=await beginLogin({store:db,now:NOW});
 const wrong=await finishLogin({store:db,loginId:q.loginId,state:q.state,
  code:"one-time-code",exchangeCode:async()=>ACCESS,serviceReadToken:READ,
  expectedOwnerId:OWNER,expectedOwnerLogin:"alphineaiinc",now:NOW+100,
  fetchImpl:async()=>({ok:true,json:async()=>({id:OWNER+1,login:"attacker"})})});
 assert.equal(wrong.verified,false);assert.equal(db.sessions.size,0);
});
test("CSRF, origin, method, expired session and duplicate cookie all fail closed",async()=>{
 const x=await loggedIn(),cookie=x.result.setCookie.split(";")[0];
 const base={store:x.db,cookie,csrfHeader:x.result.csrfToken,
  origin:"https://staging.example.test",expectedOrigin:"https://staging.example.test",
  method:"POST",now:NOW+200};
 for(const change of [
  {csrfHeader:"x".repeat(43)},{origin:"https://evil.example.test"},
  {origin:"http://staging.example.test"},{method:"GET"},
  {cookie:cookie+"; "+cookie},{cookie:""}, {now:x.result.expiresAt}
 ]){
  const r=await validateOwnerAction({...base,...change});
  assert.equal(r.verified,false,JSON.stringify(change));guard(r);
 }
});
test("logout revokes session and clears strict host cookie",async()=>{
 const x=await loggedIn(),cookie=x.result.setCookie.split(";")[0];
 assert.equal(parseCookie(cookie)!==null,true);
 const r=await logout({store:x.db,cookie});
 guard(r);assert.equal(x.db.sessions.size,0);
 assert.match(r.clearCookie,/Max-Age=0/);
 const check=await validateOwnerAction({store:x.db,cookie,
  origin:"https://staging.example.test",expectedOrigin:"https://staging.example.test",
  method:"POST",csrfHeader:x.result.csrfToken,now:NOW+200});
 assert.equal(check.verified,false);
});

test("OAuth callback rejects unbound login, duplicate cookie, and attacker injected handle",async()=>{
 const db=store(),r=await beginLogin({store:db,now:NOW});
 const base={store:db,state:r.state,code:"single-use-auth-code",
 exchangeCode:async()=>ACCESS,serviceReadToken:READ,expectedOwnerId:OWNER,
 expectedOwnerLogin:"alphineaiinc",now:NOW+100,fetchImpl:github};
 for(const loginCookie of [undefined,"",r.setLoginCookie.split(";")[0]+"; "+r.setLoginCookie.split(";")[0],
  "__Host-aca_login="+"x".repeat(43)]){
  const outcome=await finishLogin({...base,loginCookie});
  assert.equal(outcome.verified,false);
 }
 assert.equal(db.pending.size,1);
 const good=await finishLogin({...base,loginCookie:r.setLoginCookie.split(";")[0]});
 assert.equal(good.verified,true);
});
