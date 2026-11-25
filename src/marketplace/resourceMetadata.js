"use strict";
function createResourceMetadata({enabled=false,resource,issuer}={}){
 if(!enabled)return (_req,res)=>res.status(404).end();
 for(const value of [resource,issuer]){
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password||u.hash||u.search)throw Error("INVALID_MARKETPLACE_URL");
 }
 const metadata=Object.freeze({resource,authorization_servers:[issuer],scopes_supported:["aca:profile:read","aca:requests:count"],bearer_methods_supported:["header"]});
 return (_req,res)=>res.set("Cache-Control","no-store").json(metadata);
}
module.exports={createResourceMetadata};
