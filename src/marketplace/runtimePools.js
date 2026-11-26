"use strict";
const {mountMarketplace}=require("./mount");
const {connectionPolicy}=require("../db/connectionPolicy");
function identity(value){
 const url=new URL(connectionPolicy(value).connectionString);
 if(!url.username||!url.password)throw Error("MARKETPLACE_DATABASE_IDENTITY_REQUIRED");
 return decodeURIComponent(url.username);
}
function mountRuntimeMarketplace(app,env={}){
 if(env.ACA_MARKETPLACE_ENABLED!=="true")return mountMarketplace(app,{env});
 const resource=env.ACA_MARKETPLACE_RESOURCE_DATABASE_URL;
 const local=env.ACA_MARKETPLACE_LOCAL_ISSUER_ENABLED==="true";
 const issuer=env.ACA_MARKETPLACE_ISSUER_DATABASE_URL;
 const names=[identity(resource),identity(env.DATABASE_URL)];
 if(local)names.push(identity(issuer));
 if(new Set(names).size!==names.length)throw Error("MARKETPLACE_DISTINCT_DATABASE_IDENTITIES_REQUIRED");
 const {Pool}=require("pg");
 const create=value=>new Pool({...connectionPolicy(value),max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:10000});
 const resourcePool=create(resource),issuerPool=local?create(issuer):undefined;
 return mountMarketplace(app,{env,resourcePool,issuerPool});
}
module.exports={mountRuntimeMarketplace};
