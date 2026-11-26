"use strict";
const {mountMarketplace}=require("./mount");
const {connectionPolicy}=require("../db/connectionPolicy");
function identity(value){
 const url=new URL(connectionPolicy(value).connectionString);
 if(!url.username||!url.password)throw Error("MARKETPLACE_DATABASE_IDENTITY_REQUIRED");
 return decodeURIComponent(url.username);
}
function createPoolCleanup(pools){
 let pending;
 return function close(){
  if(!pending)pending=Promise.allSettled(pools.map(pool=>Promise.resolve().then(()=>pool.end()))).then(results=>{
   if(results.some(result=>result.status==="rejected"))throw Error("MARKETPLACE_POOL_CLEANUP_FAILED");
  });
  return pending;
 };
}
function mountRuntimeMarketplace(app,env={}, {createPool, mount=mountMarketplace}={}){
 if(env.ACA_MARKETPLACE_ENABLED!=="true"){
  mount(app,{env});
  return {close:createPoolCleanup([])};
 }
 const resource=env.ACA_MARKETPLACE_RESOURCE_DATABASE_URL;
 const local=env.ACA_MARKETPLACE_LOCAL_ISSUER_ENABLED==="true";
 const issuer=env.ACA_MARKETPLACE_ISSUER_DATABASE_URL;
 const names=[identity(resource),identity(env.DATABASE_URL)];
 if(local)names.push(identity(issuer));
 if(new Set(names).size!==names.length)throw Error("MARKETPLACE_DISTINCT_DATABASE_IDENTITIES_REQUIRED");
 const {Pool}=require("pg");
 const create=createPool|| (value=>new Pool({...connectionPolicy(value),max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:10000}));
 const pools=[];
 const close=createPoolCleanup(pools);
 try {
  const resourcePool=create(resource);pools.push(resourcePool);
  const issuerPool=local?create(issuer):undefined;
  if(issuerPool)pools.push(issuerPool);
  mount(app,{env,resourcePool,issuerPool});
  return {close};
 } catch(error){
  void close().catch(()=>{});
  throw error;
 }
}
module.exports={mountRuntimeMarketplace};
