"use strict";
/**
 * Pure pre-activation gate for isolated staging owner approval dependencies.
 * Prevents accidental use of a production origin, shared service credentials,
 * or owner-requested forwarding headers as proof of TLS/identity.
 * No network access or credentials are returned.
 */
const {trustedCallback}=require("./phase2aGitHubOAuthExchange");
const {timingSafeEqual}=require("node:crypto");
const positive=n=>Number.isSafeInteger(n)&&n>0;
const text=x=>typeof x==="string"&&x.length>0;
const deny=reason=>Object.freeze({ready:false,reason,
 agentDispatchAuthorized:false,dispatched:false,mergeAuthorized:false,deployAuthorized:false,
 signingAuthorized:false,productionAuthorization:false});
function constantEqual(a,b){
 if(!text(a)||!text(b))return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
function validateStagingOwnerMount(config={}){
 if(config.enabled!==true||config.isolatedStaging!==true)
  return deny("disabled");
 if(!trustedCallback(config.callbackUrl,config.siteOrigin)||
    !text(config.expectedSiteOrigin)||
    config.siteOrigin!==config.expectedSiteOrigin||
    !/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(config.siteOrigin)||
    config.siteOrigin.includes("alphineai.com")||
    config.siteOrigin.includes("onrender.com")&&!config.siteOrigin.startsWith("https://alphine-aca-phase2a-correction-staging."))
  return deny("untrusted_staging_origin");
 if(!positive(config.repositoryId)||!positive(config.ownerId)||
    !/^[A-Za-z0-9-]{1,39}$/.test(config.ownerLogin||"")||
    !/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.test(config.repository||""))
  return deny("invalid_repository_or_owner");
 if(!text(config.clientId)||config.clientId.length<12||
    !text(config.serviceReadToken)||config.serviceReadToken.length<24||
    !text(config.ownerOAuthClientSecret)||config.ownerOAuthClientSecret.length<24||
    constantEqual(config.serviceReadToken,config.ownerOAuthClientSecret)||
    constantEqual(config.serviceReadToken,config.reviewerSigningSecret)||
    constantEqual(config.ownerOAuthClientSecret,config.reviewerSigningSecret))
  return deny("unsafe_credential_separation");
 if(typeof config.verifyTrustedTransport!=="function"||
    typeof config.checkRateLimit!=="function"||
    !config.sessionStore?.putPending||
    !config.sessionStore?.consumePending||
    !config.sessionStore?.putSession||
    !config.sessionStore?.getSession||
    !config.sessionStore?.revokeSession||
    !config.decisionClient?.query||
    typeof config.loadPendingPacket!=="function"||
    typeof config.loadFreshHandoff!=="function"||
    typeof config.exchangeCode!=="function"||
    typeof config.fetchIdentity!=="function")
  return deny("unverified_dependencies");
 return Object.freeze({ready:true,reason:"staging_configuration_checked",
  agentDispatchAuthorized:false,dispatched:false,mergeAuthorized:false,deployAuthorized:false,
  signingAuthorized:false,productionAuthorization:false});
}
module.exports={validateStagingOwnerMount};
