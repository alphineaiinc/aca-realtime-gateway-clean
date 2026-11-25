"use strict";
const express=require("express");
const {createResourceMetadata}=require("./resourceMetadata");
const {createBusinessTools}=require("./businessTools");
function createMarketplaceRouter(config={}){
 const router=express.Router();
 if(config.enabled!==true){router.all(["/mcp","/.well-known/oauth-protected-resource/mcp"],(_req,res)=>res.status(404).end());return router;}
 if(new URL(config.resource).pathname!=="/mcp")throw Error("INVALID_RESOURCE_PATH");
 const metadata=createResourceMetadata(config);
 const profile=createBusinessTools({...config,audience:config.resource});
 const resourceMetadata=new URL("/.well-known/oauth-protected-resource"+new URL(config.resource).pathname,config.resource).href;
 router.get("/.well-known/oauth-protected-resource/mcp",metadata);
 router.post("/mcp",express.json({limit:"32kb"}),async(req,res)=>{
  res.set("Cache-Control","no-store");
  if(req.headers.origin&&req.headers.origin!==config.allowedOrigin)return res.status(403).end();
  const match=/^Bearer ([A-Za-z0-9._-]{1,8192})$/.exec(req.headers.authorization||"");

  try{if(!match)throw Error();await profile(match[1],{},"identity");}
  catch{return res.set("WWW-Authenticate",'Bearer resource_metadata="'+resourceMetadata+'"').status(401).end();}
  let server,transport;
  try{
   const {McpServer}=await import("@modelcontextprotocol/sdk/server/mcp.js");
   const {StreamableHTTPServerTransport}=await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
   server=new McpServer({name:"alphine-aca",version:"0.1.0"});
   server.registerTool("aca_get_business_profile",{description:"Read verified business profile",inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},async()=>{try{return {content:[{type:"text",text:JSON.stringify(await profile(match[1]))}]};}catch{return {isError:true,content:[{type:"text",text:"Profile unavailable"}]};}});
   server.registerTool("aca_get_request_count",{description:"Read tenant request count",inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},async()=>{try{return {content:[{type:"text",text:JSON.stringify(await profile(match[1],{},"request_count"))}]};}catch{return {isError:true,content:[{type:"text",text:"Request count unavailable"}]};}});
   transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
   res.once("close",()=>{void server.close().catch(()=>{});});
   await server.connect(transport);
   await transport.handleRequest(req,res,req.body);
  }catch{if(!res.headersSent)res.status(503).end();else res.end();if(server)await server.close().catch(()=>{});}
 });
 router.all("/mcp",(_req,res)=>res.status(405).end());
 return router;
}
module.exports={createMarketplaceRouter};
