"use strict";
/**
 * Development-only GitHub owner identity attestation. No live approval route.
 * Accepts a per-user GitHub OAuth token supplied by a separately authenticated
 * server-side session broker. Never accept an actorId/ownerId from request JSON.
 * No tokens or GitHub response bodies are included in returned results/logs.
 */
const {timingSafeEqual}=require("node:crypto");
const positive=x=>Number.isSafeInteger(x)&&x>0;
const login=x=>typeof x==="string"&&/^[A-Za-z0-9-]{1,39}$/.test(x);
const deny=reason=>Object.freeze({verified:false,reason,ownerId:null,
 agentDispatchAuthorized:false,mergeAuthorized:false,deployAuthorized:false});
function sameSecret(a,b){
 if(typeof a!=="string"||typeof b!=="string")return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
async function verifyGitHubOwner({userOAuthToken,serviceReadToken,
 expectedOwnerId,expectedOwnerLogin,fetchImpl=fetch}={}){
 if(!positive(expectedOwnerId)||!login(expectedOwnerLogin)||
    typeof userOAuthToken!=="string"||userOAuthToken.length<24||
    typeof serviceReadToken!=="string"||serviceReadToken.length<24||
    sameSecret(userOAuthToken,serviceReadToken)||
    typeof fetchImpl!=="function")
  return deny("invalid_identity_configuration");
 try{
  const response=await fetchImpl("https://api.github.com/user",{
   method:"GET",redirect:"error",signal:AbortSignal.timeout(7000),
   headers:{Authorization:"Bearer "+userOAuthToken,
    Accept:"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28",
    "Cache-Control":"no-store"}
  });
  if(!response?.ok)return deny("github_identity_unavailable");
  const data=await response.json();
  if(data?.id!==expectedOwnerId||
     String(data?.login||"").toLowerCase()!==expectedOwnerLogin.toLowerCase())
   return deny("owner_identity_mismatch");
  return Object.freeze({verified:true,ownerId:expectedOwnerId,
   authenticatedBy:"github_authenticated_user_api",
   agentDispatchAuthorized:false,mergeAuthorized:false,deployAuthorized:false});
 }catch{return deny("github_identity_unavailable");}
}
module.exports={verifyGitHubOwner};
