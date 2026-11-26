"use strict";
const {createPublicKey}=require("node:crypto");
const {createMarketplaceRouter}=require("./mcpRouter");
function mountMarketplace(app,{env={},pool}={}){
 const enabled=env.ACA_MARKETPLACE_ENABLED==="true";
 if(!enabled){app.use(createMarketplaceRouter({enabled:false}));return;}
 const resource=env.ACA_MARKETPLACE_RESOURCE,issuer=env.ACA_MARKETPLACE_ISSUER,allowedOrigin=env.ACA_MARKETPLACE_ORIGIN;
 const origin=new URL(allowedOrigin);
 if(origin.protocol!=="https:"||origin.origin!==allowedOrigin)throw Error("INVALID_MARKETPLACE_ORIGIN");
 const publicKey=createPublicKey(env.ACA_MARKETPLACE_PUBLIC_KEY);
 if(publicKey.asymmetricKeyType!=="rsa"||publicKey.asymmetricKeyDetails.modulusLength<2048)throw Error("INVALID_MARKETPLACE_KEY");
 app.use(createMarketplaceRouter({enabled,resource,issuer,allowedOrigin,publicKey,pool}));
}
module.exports={mountMarketplace};
