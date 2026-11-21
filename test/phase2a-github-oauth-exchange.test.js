"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {authorizeUrl,trustedCallback,makeCodeExchange}=
 require("../src/automation/phase2aGitHubOAuthExchange");
const cfg={clientId:"Iv1_test_client_12345",clientSecret:"server-only-secret-1234567890",
 callbackUrl:"https://staging.example.test/phase2a/oauth/callback",
 siteOrigin:"https://staging.example.test"};
test("GitHub authorize URL is pinned to callback and S256 state",()=>{
 const url=authorizeUrl({...cfg,state:"s".repeat(43),codeChallenge:"c".repeat(43)});
 const u=new URL(url);
 assert.equal(u.origin,"https://github.com");
 assert.equal(u.pathname,"/login/oauth/authorize");
 assert.equal(u.searchParams.get("code_challenge_method"),"S256");
 assert.equal(u.searchParams.get("redirect_uri"),cfg.callbackUrl);
 assert.equal(u.searchParams.get("state"),"s".repeat(43));
 assert.equal(u.searchParams.get("allow_signup"),"false");
 assert.equal(url.includes(cfg.clientSecret),false);
});
test("unsafe callback, cross-origin, invalid challenge are rejected",()=>{
 for(const change of [{callbackUrl:"http://staging.example.test/phase2a/oauth/callback"},
 {callbackUrl:"https://evil.example.test/phase2a/oauth/callback"},
 {callbackUrl:cfg.callbackUrl+"?next=evil"},
 {callbackUrl:"https://staging.example.test/other"},
 {state:"guess"},{codeChallenge:"short"}]){
  assert.equal(authorizeUrl({...cfg,state:"s".repeat(43),
   codeChallenge:"c".repeat(43),...change}),null);
 }
 assert.equal(trustedCallback(cfg.callbackUrl,cfg.siteOrigin),true);
});
test("server-only exact URL exchange sends verifier and secret in POST, returns user token only",async()=>{
 const requests=[];
 const exchange=makeCodeExchange({...cfg,fetchImpl:async(url,options)=>{
  requests.push({url,options});
  return {ok:true,text:async()=>JSON.stringify({
   access_token:"ghu_valid_test_user_access_token_12345",token_type:"bearer"
  })};
 }});
 const result=await exchange({code:"temporary-auth-code",codeVerifier:"v".repeat(43)});
 assert.equal(result,"ghu_valid_test_user_access_token_12345");
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,"https://github.com/login/oauth/access_token");
 assert.equal(requests[0].options.redirect,"error");
 const params=new URLSearchParams(requests[0].options.body);
 assert.equal(params.get("redirect_uri"),cfg.callbackUrl);
 assert.equal(params.get("code_verifier"),"v".repeat(43));
 assert.equal(params.get("client_secret"),cfg.clientSecret);
 assert.equal(requests[0].options.headers.Authorization,undefined);
});
test("GitHub errors and malformed tokens fail closed without exposing credentials",async()=>{
 for(const response of [{ok:false}, {ok:true,text:async()=>"{bad json"},
 {ok:true,text:async()=>JSON.stringify({error:"bad_verification_code"})},
 {ok:true,text:async()=>JSON.stringify({access_token:"short",token_type:"bearer"})},
 {ok:true,text:async()=>JSON.stringify({access_token:"ghu_long-token-test-1234567890",token_type:"wrong"})}]){
  const exchange=makeCodeExchange({...cfg,fetchImpl:async()=>response});
  await assert.rejects(exchange({code:"temporary-code",codeVerifier:"v".repeat(43)}),
   err=>!String(err).includes(cfg.clientSecret));
 }
});
