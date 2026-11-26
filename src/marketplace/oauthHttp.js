"use strict";
const express=require("express");
const {rateLimit}=require("express-rate-limit");
const {randomBytes,createHmac,timingSafeEqual}=require("node:crypto");
const {redeemLogin}=require("../security/verifiedBusinessLogin");
const fields=["client_id","redirect_uri","resource","scope","response_type","code_challenge_method","code_challenge","state"];
const escape=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function createOAuthHttp({oauth,pool,issuer,loginSecret}){
 const url=new URL(issuer);
 if(url.origin!==issuer)throw Error("OAUTH_ISSUER_ORIGIN_REQUIRED");
 const router=express.Router();
 const limiter=rateLimit({windowMs:60000,limit:20,standardHeaders:"draft-8",legacyHeaders:false});
 const parse=express.urlencoded({extended:false,limit:"8kb",parameterLimit:20});
 const request=body=>Object.fromEntries(fields.map(k=>[k,body[k]]));
 const sign=(nonce,expires,req)=>createHmac("sha256",loginSecret).update(JSON.stringify([nonce,expires,req])).digest("hex");
 const secure=(req,res,next)=>{res.set({"Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'","X-Content-Type-Options":"nosniff"});next();};
 router.get("/.well-known/oauth-authorization-server",secure,(_req,res)=>res.json({issuer,authorization_endpoint:issuer+"/oauth/authorize",token_endpoint:issuer+"/oauth/token",response_types_supported:["code"],grant_types_supported:["authorization_code"],code_challenge_methods_supported:["S256"],token_endpoint_auth_methods_supported:["none"],scopes_supported:["aca:profile:read"]}));
 router.get("/oauth/authorize",limiter,secure,(req,res)=>{
  try{
   const input=request(req.query);oauth.validateRequest(input);
   const nonce=randomBytes(32).toString("hex"),expires=Date.now()+300000;
   res.cookie("__Host-aca-oauth",nonce,{secure:true,httpOnly:true,sameSite:"strict",path:"/",maxAge:300000});
   const hidden=Object.entries({...input,expires,csrf:sign(nonce,expires,input)}).map(([k,v])=>'<input type="hidden" name="'+escape(k)+'" value="'+escape(v)+'">').join("");
   res.type("html").send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Alphine AI authorization</title><h1>Authorize ACA business profile access</h1><p>Use the single-use code from your existing ACA business sign-in. Approving grants read-only access to your business profile to the registered client.</p><form method="post" action="/oauth/authorize">'+hidden+'<label>Sign-in code <input name="login_code" type="password" required autocomplete="one-time-code"></label><button name="consent" value="approve">Approve access</button></form></html>');
  }catch{return res.status(400).end();}
 });
 router.post("/oauth/authorize",limiter,secure,parse,async(req,res)=>{
  try{
   if(req.get("origin")!==issuer||req.body?.consent!=="approve")return res.status(403).end();
   const input=request(req.body);oauth.validateRequest(input);
   const cookies=(req.get("cookie")||"").split(";").map(v=>v.trim()).filter(v=>v.startsWith("__Host-aca-oauth="));
   const nonce=cookies.length===1?cookies[0].slice("__Host-aca-oauth=".length):"";
   const expires=Number(req.body.expires),csrf=req.body.csrf;
   if(!/^[a-f0-9]{64}$/.test(nonce)||!Number.isSafeInteger(expires)||expires<Date.now()||expires>Date.now()+300000||typeof csrf!=="string"||! /^[a-f0-9]{64}$/.test(csrf)||!timingSafeEqual(Buffer.from(csrf,"hex"),Buffer.from(sign(nonce,expires,input),"hex")))return res.status(403).end();
   const login=await redeemLogin({query:pool.query.bind(pool),token:req.body.login_code,secret:loginSecret});
   if(!login)return res.status(401).end();
   const result=await oauth.authorize(input,login);
   res.clearCookie("__Host-aca-oauth",{secure:true,httpOnly:true,sameSite:"strict",path:"/"});
   const target=new URL(input.redirect_uri);target.searchParams.set("code",result.code);target.searchParams.set("state",result.state);
   return res.redirect(303,target.href);
  }catch{return res.status(400).end();}
 });
 router.post("/oauth/token",limiter,secure,parse,async(req,res)=>{
  if(!req.is("application/x-www-form-urlencoded"))return res.status(415).json({error:"invalid_request"});
  try{return res.json(await oauth.exchange(req.body));}catch{return res.status(400).json({error:"invalid_grant"});}
 });
 return router;
}
module.exports={createOAuthHttp};
