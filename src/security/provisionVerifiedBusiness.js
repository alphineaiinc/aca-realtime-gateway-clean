"use strict";
const {consumeChallengeAndProvision}=require("./onboardingTransaction");
// Internal operation: only a consumed email challenge can establish identity.
// Routing and notification activation remain separate authorized operations.
async function provisionVerifiedBusiness({pool,token,email,businessName}){
 const client=await pool.connect();
 try{
  return await consumeChallengeAndProvision({client,token,email,businessName,provision:async({client,email,businessName})=>{
   const {rows}=await client.query("INSERT INTO public.master_tenants(business_name,preferred_lang,region) VALUES($1,'en-US','global') RETURNING id",[businessName]);
   const tenantId=rows[0].id;
   await client.query("INSERT INTO public.aca_business_identities(email,tenant_id,verified_at,is_active) VALUES($1,$2,NOW(),TRUE)",[email,tenantId]);
   await client.query("INSERT INTO public.aca_notification_recipients(tenant_id,email,verified_at,is_active) VALUES($1,$2,NOW(),FALSE)",[tenantId,email]);
   return {tenantId,routingActive:false,notificationsActive:false};
  }});
 }finally{client.release();}
}
module.exports={provisionVerifiedBusiness};
