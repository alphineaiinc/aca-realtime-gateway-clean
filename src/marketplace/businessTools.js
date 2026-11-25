"use strict";
// Internal resource boundary. Dedicated trusted issuer and audience; never reuse ACA login JWT.
const jwt=require("jsonwebtoken");
function createBusinessTools({pool,publicKey,issuer,audience}){
 if(!publicKey||!issuer||!audience||audience==="aca-business")throw Error("MARKETPLACE_CONFIG");
 return async function profile(token,args={},operation="profile"){
  if(typeof token!=="string"||token.length>8192||!args||typeof args!=="object"||Array.isArray(args)||Object.keys(args).length)throw Error("UNAUTHORIZED");
  const c=jwt.verify(token,publicKey,{algorithms:["RS256"],issuer,audience});
  if(!["identity","profile","request_count"].includes(operation))throw Error("UNAUTHORIZED");
  if(typeof c.sub!=="string"||!Number.isSafeInteger(c.tenant_id)||c.tenant_id<=0||!Number.isInteger(c.exp)||typeof c.scope!=="string"||(operation==="identity"?!c.scope.split(" ").some(s=>["aca:profile:read","aca:requests:count"].includes(s)):!c.scope.split(" ").includes(operation==="profile"?"aca:profile:read":"aca:requests:count")))throw Error("UNAUTHORIZED");
  const {rows}=await pool.query("SELECT t.business_name,t.preferred_lang,t.region FROM public.master_tenants t JOIN public.aca_business_identities i ON i.tenant_id=t.id WHERE t.id=$1 AND i.email=$2 AND i.is_active LIMIT 2",[c.tenant_id,c.sub]);
  if(rows.length!==1)throw Error("UNAUTHORIZED");
  if(operation==="identity")return true;
  if(operation==="request_count"){
   const result=await pool.query("SELECT count(*)::text AS count FROM public.aca_customer_requests r WHERE r.tenant_id=$1 AND EXISTS (SELECT 1 FROM public.aca_business_identities i WHERE i.tenant_id=r.tenant_id AND i.email=$2 AND i.is_active)",[c.tenant_id,c.sub]);
   return {request_count:result.rows[0].count};
  }
  return {business_name:rows[0].business_name,preferred_lang:rows[0].preferred_lang,region:rows[0].region};
 };
}
module.exports={createBusinessTools};
