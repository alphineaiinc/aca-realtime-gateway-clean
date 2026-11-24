"use strict";
const jwt=require("jsonwebtoken");
async function verifiedBusiness(req,res,next){
 res.set("Cache-Control","no-store");
 try{
 const header=req.headers.authorization||"";
 if(!header.startsWith("Bearer "))throw Error();
 const claims=jwt.verify(header.slice(7),process.env.JWT_SECRET,{algorithms:["HS256"],issuer:"alphine-ai",audience:"aca-business"});
 if(claims.purpose!=="verified_business"||!Number.isSafeInteger(claims.tenant_id)||claims.tenant_id<=0||typeof claims.sub!=="string")throw Error();
 const {rows}=await require("../db/pool").query("SELECT tenant_id FROM public.aca_business_identities WHERE email=$1 AND tenant_id=$2 AND is_active",[claims.sub,claims.tenant_id]);
 if(rows.length!==1)throw Error();
 req.tenant_id=claims.tenant_id;req.role="business";req.partner_id=null;req.jwt_payload=claims;
 }catch{return res.status(401).json({ok:false,error:"Unauthorized"});}
 return next();
}
module.exports={verifiedBusiness};
