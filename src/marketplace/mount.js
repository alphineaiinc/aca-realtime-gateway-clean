"use strict";
const {createPublicKey}=require("node:crypto");
const {createMarketplaceRouter}=require("./mcpRouter");
function mountMarketplace(app,{env={},resourcePool,issuerPool}={}){
 const enabled=env.ACA_MARKETPLACE_ENABLED==="true";
 if(!enabled){app.use(createMarketplaceRouter({enabled:false}));return;}
 const resource=env.ACA_MARKETPLACE_RESOURCE,issuer=env.ACA_MARKETPLACE_ISSUER,allowedOrigin=env.ACA_MARKETPLACE_ORIGIN;
 const origin=new URL(allowedOrigin);
 if(origin.protocol!=="https:"||origin.origin!==allowedOrigin)throw Error("INVALID_MARKETPLACE_ORIGIN");
 const publicKey=createPublicKey(env.ACA_MARKETPLACE_PUBLIC_KEY);
 if(publicKey.asymmetricKeyType!=="rsa"||publicKey.asymmetricKeyDetails.modulusLength<2048)throw Error("INVALID_MARKETPLACE_KEY");
 if(!resourcePool||typeof resourcePool.query!=="function")throw Error("MARKETPLACE_RESOURCE_POOL_REQUIRED");
 if(env.ACA_MARKETPLACE_LOCAL_ISSUER_ENABLED==="true"){
  if(!issuerPool||typeof issuerPool.query!=="function"||issuerPool===resourcePool)throw Error("MARKETPLACE_DISTINCT_ISSUER_POOL_REQUIRED");
  const {createOAuthAuthorization}=require("./oauthAuthorization");
  const {createOAuthHttp}=require("./oauthHttp");
  const oauth=createOAuthAuthorization({pool:issuerPool,issuer,resource,clientId:env.ACA_MARKETPLACE_CLIENT_ID,redirectUri:env.ACA_MARKETPLACE_REDIRECT_URI,loginSecret:env.ACA_MARKETPLACE_LOGIN_SECRET,privateKey:env.ACA_MARKETPLACE_SIGNING_KEY});
  if(!publicKey.equals(oauth.publicKey))throw Error("MARKETPLACE_SIGNING_KEY_MISMATCH");
  app.use(createOAuthHttp({oauth,pool:issuerPool,issuer,loginSecret:env.ACA_MARKETPLACE_LOGIN_SECRET}));
 }
 // The trusted issuer must map its subject to the verified ACA email identity.
 app.use(createMarketplaceRouter({enabled,resource,issuer,allowedOrigin,publicKey,pool:resourcePool,requireActiveMembership:true}));
}
module.exports={mountMarketplace};
