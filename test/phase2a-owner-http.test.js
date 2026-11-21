"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {Readable}=require("node:stream");
const {handleOwnerHttp}=require("../src/automation/phase2aOwnerHttp");
const {makeOwnerDecisionPacket}=require("../src/automation/phase2aOwnerDecision");
const NOW=Date.now(),OWNER=230486228,R=1080201236;
const handoff={state:"request_owner_approval",dispatched:false,
 agentDispatchAuthorized:false,mergeAuthorized:false,deployAuthorized:false,
 request:{type:"manual_correction_approval_request",issueNumber:12,
 prNumber:13,headSha:"a".repeat(40),runId:777,attempt:1,maxAttempts:2}};
function store(){
 const pending=new Map(),sessions=new Map();
 return {pending,sessions,
  async putPending(r){pending.set(r.digest,r);return true;},
  async consumePending(d){const r=pending.get(d);pending.delete(d);return r||null;},
  async putSession(r){sessions.set(r.digest,r);return true;},
  async getSession(d){return sessions.get(d)||null;},
  async revokeSession(d){sessions.delete(d);}
 };
}
function call(opts,{method="GET",url="/phase2a/oauth/start",headers={},body=null}={}){
 const request=Readable.from(body===null?[]:[JSON.stringify(body)]);
 request.method=method;request.url=url;request.headers=headers;
 let status,reply,meta;
 const response={writeHead(s,h){status=s;meta=h;},end(s){reply=JSON.parse(s);}};
 return handleOwnerHttp(request,response,opts).then(handled=>({
  handled,status,body:reply,headers:meta}));
}
function setup(){
 const sessionStore=store(),packet=makeOwnerDecisionPacket({
  handoff,repositoryId:R,ownerId:OWNER,now:NOW});
 let writes=0,lookups=0;
 const opts={enabled:true,isolatedStaging:true,sessionStore,
  repositoryId:R,ownerId:OWNER,ownerLogin:"alphineaiinc",
  clientId:"Iv1_staging_test_4567890",
  callbackUrl:"https://staging.example.test/phase2a/oauth/callback",
  siteOrigin:"https://staging.example.test",
  expectedSiteOrigin:"https://staging.example.test",
  repository:"alphineaiinc/aca-realtime-gateway-clean",
  ownerOAuthClientSecret:"dedicated-user-oauth-secret-example-12345",
  reviewerSigningSecret:"separate-reviewer-signing-secret-value",
  verifyTrustedTransport:async()=>true,
  serviceReadToken:"separate-readonly-service-pat-example-1234",
  exchangeCode:async()=>"separate-github-user-oauth-token-12345",
  fetchIdentity:async()=>({ok:true,json:async()=>({id:OWNER,login:"alphineaiinc"})}),
  decisionClient:{query:async(sql)=>{writes++;
   return {rows:sql.includes("UPDATE")?[{request_id:packet.id}]:[]};}},
  checkRateLimit:async()=>true,
  loadPendingPacket:async({requestId})=>{lookups++;return requestId===packet.id?packet:null;},
  loadFreshHandoff:async()=>handoff,
 };
 return {opts,packet,get writes(){return writes;},get lookups(){return lookups;}};
}
async function login(x){
 const start=await call(x.opts);
 assert.equal(start.status,200);
 const authUrl=new URL(start.body.authorizationUrl);
 assert.equal(authUrl.hostname,"github.com");
 const state=authUrl.searchParams.get("state");
 const loginCookie=start.headers["Set-Cookie"].split(";")[0];
 const callback=await call(x.opts,{url:"/phase2a/oauth/callback?code=one-time-code&state="+state,
  headers:{cookie:loginCookie}});
 return {start,callback};
}
test("disabled adapter is fail-closed, not mounted, and has no external requests",async()=>{
 const x=setup();x.opts.enabled=false;
 const r=await call(x.opts);assert.equal(r.status,404);
 assert.equal(r.body.state,"disabled");assert.equal(x.writes,0);
 const normal=await call({...setup().opts},{url:"/unrecognized"});
 assert.equal(normal.handled,false);
});
test("OAuth start/callback returns only user-session cookie and CSRF, no access token",async()=>{
 const x=setup(),{start,callback}=await login(x);
 assert.equal(start.body.agentDispatchAuthorized,false);
 assert.equal(callback.status,200);
 assert.equal(callback.body.state,"authenticated");
 assert.match(callback.headers["Set-Cookie"][1],/^__Host-aca_owner=/);
 assert.match(callback.headers["Set-Cookie"][0],/Max-Age=0/);
 assert.equal(JSON.stringify(callback).includes("separate-github-user-oauth-token"),false);
 assert.match(callback.body.csrfToken,/^[A-Za-z0-9_-]{43}$/);
});
test("callback cannot replay and tampered state fails before token exchange",async()=>{
 const x=setup(),start=await call(x.opts);
 const state=new URL(start.body.authorizationUrl).searchParams.get("state");
 const cookie=start.headers["Set-Cookie"].split(";")[0];
 const bad=await call(x.opts,{url:"/phase2a/oauth/callback?code=one-time-code&state="+
  "x".repeat(43),headers:{cookie}});
 assert.equal(bad.status,401);
 const replay=await call(x.opts,{url:"/phase2a/oauth/callback?code=one-time-code&state="+state,
  headers:{cookie}});
 assert.equal(replay.status,401);
});
test("approval rejects missing CSRF, cross-origin, unknown ID and browser-owned packet",async()=>{
 const x=setup(),{callback}=await login(x);
 const cookie=callback.headers["Set-Cookie"][1].split(";")[0];
 const base={method:"POST",url:"/phase2a/owner/decision",
  headers:{cookie,origin:"https://staging.example.test",
   "x-aca-csrf":callback.body.csrfToken,"content-type":"application/json"},
  body:{decision:"approve",requestId:x.packet.id}};
 const bad=[
  {headers:{...base.headers,"x-aca-csrf":"z".repeat(43)}},
  {headers:{...base.headers,origin:"https://evil.example.test"}},
  {body:{decision:"approve",requestId:"b".repeat(64)}},
  {body:{...base.body,actorId:OWNER}},
  {body:{...base.body,packet:x.packet}},
 ];
 for(const override of bad){
  const result=await call(x.opts,{...base,...override});
  assert.notEqual(result.status,200);assert.equal(result.body.agentDispatchAuthorized,false);
 }
 assert.equal(x.writes,0);
});
test("authentic approval intent remains advisory and never triggers code execution",async()=>{
 const x=setup(),{callback}=await login(x);
 const cookie=callback.headers["Set-Cookie"][1].split(";")[0];
 const r=await call(x.opts,{method:"POST",url:"/phase2a/owner/decision",
  headers:{cookie,origin:"https://staging.example.test",
   "x-aca-csrf":callback.body.csrfToken,"content-type":"application/json"},
  body:{decision:"approve",requestId:x.packet.id}});
 assert.equal(r.status,200);assert.equal(r.body.state,"owner_intent_to_review");
 for(const key of ["agentDispatchAuthorized","mergeAuthorized","deployAuthorized",
  "signingAuthorized","productionAuthorization"])assert.equal(r.body[key],false);
 assert.ok(x.writes>0);
});
test("rate limiter dependency denies requests before touching OAuth storage",async()=>{
 const x=setup();x.opts.checkRateLimit=()=>false;
 const r=await call(x.opts);
 assert.equal(r.status,429);assert.equal(x.opts.sessionStore.pending.size,0);
});

test("unauthenticated approval cannot probe the pending request lookup",async()=>{
 const x=setup(),{callback}=await login(x);
 const cookie=callback.headers["Set-Cookie"][1].split(";")[0];
 const result=await call(x.opts,{method:"POST",url:"/phase2a/owner/decision",
  headers:{cookie,origin:"https://evil.example.test",
   "x-aca-csrf":callback.body.csrfToken,"content-type":"application/json"},
  body:{decision:"approve",requestId:x.packet.id}});
 assert.equal(result.status,401);
 assert.equal(x.lookups,0);
 assert.equal(x.writes,0);
});

test("disabled adapter never consumes unrelated routes",async()=>{
 const x=setup();x.opts.enabled=false;
 const r=await call(x.opts,{url:"/health"});
 assert.equal(r.handled,false);
});
test("rate limiter exceptions deny requests without consuming login state",async()=>{
 const x=setup();x.opts.checkRateLimit=async()=>{throw Error("rate limit store down");};
 const r=await call(x.opts);
 assert.equal(r.status,429);assert.equal(x.opts.sessionStore.pending.size,0);
 assert.equal(JSON.stringify(r.body).includes("rate limit store down"),false);
});
test("logout requires same-origin POST with authenticated CSRF",async()=>{
 const x=setup(),{callback}=await login(x);
 const cookie=callback.headers["Set-Cookie"][1].split(";")[0];
 const csrf=callback.body.csrfToken;
 const wrong=await call(x.opts,{method:"POST",url:"/phase2a/owner/logout",
  headers:{cookie,origin:"https://staging.example.test"}});
 assert.equal(wrong.status,401);
 assert.equal(x.opts.sessionStore.sessions.size,1);
 const evil=await call(x.opts,{method:"POST",url:"/phase2a/owner/logout",
  headers:{cookie,origin:"https://evil.example.test","x-aca-csrf":csrf}});
 assert.equal(evil.status,401);
 assert.equal(x.opts.sessionStore.sessions.size,1);
 const valid=await call(x.opts,{method:"POST",url:"/phase2a/owner/logout",
  headers:{cookie,origin:"https://staging.example.test","x-aca-csrf":csrf}});
 assert.equal(valid.status,200);assert.equal(valid.body.state,"signed_out");
 assert.equal(x.opts.sessionStore.sessions.size,0);
});
test("callback accepts only origin-relative path and rejects absolute URLs",async()=>{
 const x=setup();
 const r=await call(x.opts,{url:"https://staging.example.test/phase2a/oauth/callback?code=a&state=b"});
 assert.equal(r.handled,false);
 const start=await call(x.opts);
 const state=new URL(start.body.authorizationUrl).searchParams.get("state");
 const cookie=start.headers["Set-Cookie"].split(";")[0];
 const tampered=await call(x.opts,{url:"/phase2a/oauth/callback?code=one-time-code&state="+state+"#fragment",
 headers:{cookie}});
 assert.equal(tampered.status,400);
 assert.equal(x.opts.sessionStore.pending.size,1);
});

test("untrusted transport blocks OAuth and intent before any storage access",async()=>{
 const x=setup();
 x.opts.verifyTrustedTransport=async()=>false;
 const r=await call(x.opts);
 assert.equal(r.status,403);
 assert.equal(x.opts.sessionStore.pending.size,0);
 assert.equal(x.writes,0);
 x.opts.verifyTrustedTransport=async()=>{throw Error("spoofed proxy header");};
 const bad=await call(x.opts);
 assert.equal(bad.status,403);
 assert.equal(x.opts.sessionStore.pending.size,0);
});
test("staging mount denies origin mismatch and shared service credentials",async()=>{
 for(const overrides of [
  {expectedSiteOrigin:"https://other.example.test"},
  {siteOrigin:"https://alphineai.com"},
  {ownerOAuthClientSecret:"separate-readonly-service-pat-example-1234"},
  {verifyTrustedTransport:null},
  {repositoryId:0}
 ]){
  const x=setup();
  Object.assign(x.opts,overrides);
  const r=await call(x.opts);
  assert.equal(r.status,404,JSON.stringify(overrides));
  assert.equal(x.opts.sessionStore.pending.size,0);
 }
});
