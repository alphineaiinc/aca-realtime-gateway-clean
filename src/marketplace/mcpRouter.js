"use strict";
const express=require("express");
const {createResourceMetadata}=require("./resourceMetadata");
const {verifyBusinessToken,createBusinessTools}=require("./businessTools");
const {rateLimit}=require("express-rate-limit");
function createMarketplaceRouter(config={}){
 const router=express.Router();
 if(config.enabled!==true){router.all(["/mcp","/.well-known/oauth-protected-resource/mcp"],(_req,res)=>res.status(404).end());return router;}
 if(new URL(config.resource).pathname!=="/mcp")throw Error("INVALID_RESOURCE_PATH");
 const metadata=createResourceMetadata(config);
 const legacyProfile=createBusinessTools({pool:config.pool});
 const getBusinessProfile=config.requireActiveMembership===true?async identity=>{
  const {rows}=await config.pool.query("SELECT t.business_name,t.preferred_lang,t.region FROM public.master_tenants t JOIN public.aca_business_identities i ON i.tenant_id=t.id WHERE i.email=$1 AND i.tenant_id=$2 AND i.is_active AND i.verified_at IS NOT NULL LIMIT 2",[identity.subject,identity.tenantId]);
  if(!Array.isArray(rows)||rows.length!==1)throw Error("PROFILE_UNAVAILABLE");
  return {business_name:rows[0].business_name,preferred_lang:rows[0].preferred_lang,region:rows[0].region};
 }:legacyProfile;
 const resourceMetadata=new URL("/.well-known/oauth-protected-resource"+new URL(config.resource).pathname,config.resource).href;
 router.get("/.well-known/oauth-protected-resource/mcp",metadata);
 router.post("/mcp",rateLimit({windowMs:60_000,limit:60,standardHeaders:"draft-8",legacyHeaders:false,message:{ok:false,error:"rate_limited"}}),express.json({limit:"32kb"}),async(req,res)=>{
  res.set("Cache-Control","no-store");
  if(req.headers.origin&&req.headers.origin!==config.allowedOrigin)return res.status(403).end();
  const match=/^Bearer ([A-Za-z0-9._-]{1,8192})$/.exec(req.headers.authorization||"");
  let identity;
  try{
   if(!match)throw Error("UNAUTHORIZED");
   identity=verifyBusinessToken({token:match[1],publicKey:config.publicKey,issuer:config.issuer,audience:config.resource});
  }catch{
   return res.set("WWW-Authenticate",'Bearer resource_metadata="'+resourceMetadata+'"').status(401).end();
  }
  if(config.requireActiveMembership===true){
   try{
    const {rows}=await config.pool.query("SELECT tenant_id FROM public.aca_business_identities WHERE email=$1 AND tenant_id=$2 AND is_active AND verified_at IS NOT NULL LIMIT 2",[identity.subject,identity.tenantId]);
    if(!Array.isArray(rows)||rows.length!==1)return res.status(403).end();
   }catch{return res.status(503).end();}
  }
  let server,transport;
  try{
   const {McpServer}=await import("@modelcontextprotocol/sdk/server/mcp.js");
   const {StreamableHTTPServerTransport}=await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
   server=new McpServer({name:"alphine-aca",version:"0.1.0"});
   server.registerTool("aca_get_business_profile",{description:"Read the verified business profile associated with the authenticated tenant",inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},async()=>{
    try{return {content:[{type:"text",text:JSON.stringify(await getBusinessProfile(identity))}]};}
    catch{return {isError:true,content:[{type:"text",text:"Profile unavailable"}]};}
   });
   transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
   res.once("close",()=>{void server.close().catch(()=>{});});
   await server.connect(transport);
   await transport.handleRequest(req,res,req.body);
  }catch{
   if(!res.headersSent)res.status(503).end();else res.end();
   if(server)await server.close().catch(()=>{});
  }
 });
 router.all("/mcp",(_req,res)=>res.status(405).end());
 return router;
}
module.exports={createMarketplaceRouter};
