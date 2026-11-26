"use strict";
// The configured OAuth issuer is the tenant-identity authority. The signed tenant_id
// claim is accepted only after issuer, audience, algorithm, expiry and scope validation.
// No caller-supplied tenant identifier or assumed identity table is used.
const jwt=require("jsonwebtoken");

function verifyBusinessToken({token,publicKey,issuer,audience}){
 if(!publicKey||!issuer||!audience||audience==="aca-business")throw Error("MARKETPLACE_CONFIG");
 if(typeof token!=="string"||token.length>8192)throw Error("UNAUTHORIZED");
 const claims=jwt.verify(token,publicKey,{algorithms:["RS256"],issuer,audience});
 // jsonwebtoken accepts an audience allow-list; this resource requires one exact audience.
 if(claims.iss!==issuer||claims.aud!==audience)throw Error("UNAUTHORIZED");
 if(typeof claims.sub!=="string"||!claims.sub.trim()||!Number.isSafeInteger(claims.tenant_id)||claims.tenant_id<=0||!Number.isInteger(claims.exp))throw Error("UNAUTHORIZED");
 const scopes=typeof claims.scope==="string"?claims.scope.split(" "):[];
 if(!scopes.includes("aca:profile:read"))throw Error("UNAUTHORIZED");
 return Object.freeze({subject:claims.sub,tenantId:claims.tenant_id,scopes:Object.freeze(scopes)});
}

function createBusinessTools({pool}){
 if(!pool||typeof pool.query!=="function")throw Error("MARKETPLACE_CONFIG");
 return async function getBusinessProfile(identity){
  if(!identity||!Number.isSafeInteger(identity.tenantId)||identity.tenantId<=0)throw Error("UNAUTHORIZED");
  const {rows}=await pool.query(
   "SELECT business_name,preferred_lang,region FROM public.master_tenants WHERE id=$1 LIMIT 2",
   [identity.tenantId]
  );
  if(!Array.isArray(rows)||rows.length!==1)throw Error("PROFILE_UNAVAILABLE");
  return {business_name:rows[0].business_name,preferred_lang:rows[0].preferred_lang,region:rows[0].region};
 };
}

module.exports={verifyBusinessToken,createBusinessTools};
