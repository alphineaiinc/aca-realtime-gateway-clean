"use strict";
// Internal resource boundary. Dedicated trusted issuer and audience; never reuse ACA login JWT.
const jwt=require("jsonwebtoken");
function createBusinessTools({pool,publicKey,issuer,audience}){
 if(!publicKey||!issuer||!audience||audience==="aca-business")throw Error("MARKETPLACE_CONFIG");
 return async function profile(token,args={}){
  if(typeof token!=="string"||token.length>8192||!args||typeof args!=="object"||Array.isArray(args)||Object.keys(args).length)throw Error("UNAUTHORIZED");
  const c=jwt.verify(token,publicKey,{algorithms:["RS256"],issuer,audience});
  if(typeof c.sub!=="string"||!Number.isSafeInteger(c.tenant_id)||c.tenant_id<=0||!Number.isInteger(c.exp)||typeof c.scope!=="string"||!c.scope.split(" ").includes("aca:profile:read"))throw Error("UNAUTHORIZED");
  const {rows}=await pool.query("SELECT t.business_name,t.preferred_lang,t.region FROM public.master_tenants t JOIN public.aca_business_identities i ON i.tenant_id=t.id WHERE t.id=$1 AND i.email=$2 AND i.is_active LIMIT 2",[c.tenant_id,c.sub]);
  if(rows.length!==1)throw Error("UNAUTHORIZED");
  return {business_name:rows[0].business_name,preferred_lang:rows[0].preferred_lang,region:rows[0].region};
 };
}
module.exports={createBusinessTools};
